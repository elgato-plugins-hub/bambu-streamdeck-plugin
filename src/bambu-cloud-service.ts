import mqtt, { MqttClient } from "mqtt";
import { EventEmitter } from "node:events";
import { randomBytes } from "node:crypto";
import {
	AmsState,
	AmsTray,
	AmsUnit,
	BambuCloudServiceOptions,
	BambuTelemetry,
	CloudRegion,
	GcodeState,
} from "./types";

const BAMBU_PORT = 8883;
const BAMBU_CLOUD_KEEPALIVE = 30;
const AMS_TRAYS_PER_UNIT = 4;

function brokerHost(region: CloudRegion): string {
	return region === "cn" ? "cn.mqtt.bambulab.com" : "us.mqtt.bambulab.com";
}

function apiBase(region: CloudRegion): string {
	return region === "cn" ? "https://api.bambulab.cn" : "https://api.bambulab.com";
}

function decodeJwtUserId(token: string): string | null {
	const parts = token.split(".");
	if (parts.length < 2) return null;
	try {
		const payloadJson = Buffer.from(parts[1], "base64url").toString("utf8");
		const payload = JSON.parse(payloadJson);
		const uid = payload.uid ?? payload.sub ?? payload.user_id;
		if (uid === undefined || uid === null || uid === "") return null;
		return `u_${uid}`;
	} catch {
		return null;
	}
}

async function fetchUserIdFromProfile(token: string, region: CloudRegion): Promise<string | null> {
	const url = `${apiBase(region)}/v1/user-service/my/profile`;
	const res = await fetch(url, {
		headers: {
			Authorization: `Bearer ${token}`,
			"User-Agent": "bambu_network_agent/01.09.05.01",
			"X-BBL-Client-Name": "OrcaSlicer",
			"X-BBL-Client-Type": "slicer",
		},
	});
	if (!res.ok) return null;
	const body = (await res.json()) as { uidStr?: string; uid?: string | number };
	const uid = body.uidStr ?? body.uid;
	if (uid === undefined || uid === null || uid === "") return null;
	return `u_${uid}`;
}

function parseGcodeState(raw: unknown): GcodeState | null {
	switch (raw) {
		case "IDLE":
		case "RUNNING":
		case "PAUSE":
		case "PREPARE":
		case "FINISH":
		case "FAILED":
			return raw;
		case "UNKNOWN":
			return "UNKNOWN";
		default:
			return raw ? "OTHER" : null;
	}
}

function fanPercent(v: unknown): number | null {
	if (v === undefined || v === null) return null;
	const n = typeof v === "string" ? parseInt(v, 10) : Number(v);
	if (Number.isNaN(n)) return null;
	return Math.round((n / 15) * 100);
}

function formatColorHex(raw: unknown): string | null {
	if (typeof raw !== "string" || !raw) return null;
	let clean = raw.replace(/^#/, "");
	if (clean.length >= 6) {
		return `#${clean.slice(0, 6)}`;
	}
	return `#${clean}`;
}

function parseAms(printObj: Record<string, any>): AmsState | null {
	const amsRoot = printObj.ams || printObj.ams_status;
	if (!amsRoot && !printObj.vt_tray) return null;

	const unitsRaw: any[] = Array.isArray(amsRoot?.ams) ? amsRoot.ams : [];
	const units: AmsUnit[] = unitsRaw.map((u) => {
		const trays: AmsTray[] = (Array.isArray(u.tray) ? u.tray : []).map((t: any, i: number) => {
			const present = typeof t.tray_type === "string" && t.tray_type.length > 0;
			const color = formatColorHex(t.tray_color || (Array.isArray(t.cols) && t.cols.length > 0 ? t.cols[0] : null));
			const type: string | null = present ? t.tray_sub_brands || t.tray_type : null;
			const remainRaw = t.remain !== undefined ? Number(t.remain) : -1;
			return {
				index: t.id !== undefined ? Number(t.id) : i,
				present,
				type,
				color,
				remainPercent: remainRaw > 0 ? remainRaw : null,
			};
		});

		const humidityVal = u.humidity !== undefined ? Number(u.humidity) : (amsRoot?.humidity !== undefined ? Number(amsRoot.humidity) : null);
		return {
			id: u.id !== undefined ? Number(u.id) : -1,
			humidityPercent: humidityVal !== null && !isNaN(humidityVal) ? humidityVal : null,
			tempC: u.temp !== undefined ? Number(u.temp) : null,
			trays,
		};
	});

	const trayNowRaw = amsRoot?.tray_now !== undefined ? Number(amsRoot.tray_now) : (printObj.tray_now !== undefined ? Number(printObj.tray_now) : null);
	let activeTrayIndex: number | null = null;
	if (trayNowRaw !== null && trayNowRaw >= 0 && trayNowRaw < AMS_TRAYS_PER_UNIT * (units.length || 1)) {
		activeTrayIndex = trayNowRaw;
	}

	const vt = printObj.vt_tray;
	const externalSpoolActive = trayNowRaw === 254;
	const externalSpool: AmsState["externalSpool"] =
		vt && typeof vt.tray_type === "string" && vt.tray_type.length > 0
			? {
					present: true,
					type: vt.tray_sub_brands || vt.tray_type,
					color: formatColorHex(vt.tray_color || (Array.isArray(vt.cols) && vt.cols.length > 0 ? vt.cols[0] : null)),
			  }
			: null;

	return { present: true, units, activeTrayIndex, externalSpoolActive, externalSpool };
}

export class BambuCloudService extends EventEmitter {
	private readonly options: Required<Omit<BambuCloudServiceOptions, "userId">>;
	private userId: string | null;
	private client: MqttClient | null = null;
	private pushallSeq = 0;
	private pushallTimer: NodeJS.Timeout | null = null;

	private cumulativeTelemetry: BambuTelemetry;

	constructor(options: BambuCloudServiceOptions) {
		super();
		this.options = {
			userToken: options.userToken,
			deviceSerial: options.deviceSerial,
			region: options.region ?? "us",
			rejectUnauthorized: options.rejectUnauthorized ?? true,
			pushAllOnConnect: options.pushAllOnConnect ?? true,
			debug: options.debug ?? false,
		};
		this.userId = options.userId ?? null;

		this.cumulativeTelemetry = {
			timestamp: Date.now(),
			deviceSerial: options.deviceSerial,
			gcodeState: "UNKNOWN",
			printing: false,
			progressPercent: 0,
			remainingMinutes: null,
			layerNum: null,
			totalLayers: null,
			subtaskName: null,
			nozzleTempC: null,
			nozzleTargetC: null,
			bedTempC: null,
			bedTargetC: null,
			chamberTempC: null,
			speedLevel: null,
			wifiSignalDbm: null,
			fans: { coolingPercent: null, auxPercent: null, chamberPercent: null, heatbreakPercent: null },
			lightOn: null,
			ams: null,
			raw: null,
		};
	}

	private log(...args: unknown[]): void {
		if (this.options.debug) console.log("[BambuCloudService]", ...args);
	}

	async connect(): Promise<void> {
		if (!this.userId) {
			this.userId = decodeJwtUserId(this.options.userToken);
			if (!this.userId) {
				this.log("el token no parece un JWT decodificable, probando /profile...");
				this.userId = await fetchUserIdFromProfile(this.options.userToken, this.options.region);
			}
			if (!this.userId) {
				throw new Error("No se pudo resolver el userId de Bambu a partir del token");
			}
			this.log("userId resuelto:", this.userId);
		}

		const host = brokerHost(this.options.region);
		const clientId = `bblp_${randomBytes(6).toString("hex")}`;

		this.log(`conectando a mqtts://${host}:${BAMBU_PORT} como ${this.userId}`);

		this.client = mqtt.connect({
			host,
			port: BAMBU_PORT,
			protocol: "mqtts",
			protocolVersion: 4,
			username: this.userId,
			password: this.options.userToken,
			clientId,
			keepalive: BAMBU_CLOUD_KEEPALIVE,
			rejectUnauthorized: this.options.rejectUnauthorized,
			reconnectPeriod: 5000,
		});

		this.client.on("connect", () => {
			const topic = `device/${this.options.deviceSerial}/report`;
			this.client!.subscribe(topic, (err) => {
				if (err) {
					this.emit("error", err);
					return;
				}
				this.log("suscrito a", topic);
				this.emit("connected");
				if (this.options.pushAllOnConnect) this.requestPushAll();

				if (this.pushallTimer) clearInterval(this.pushallTimer);
				this.pushallTimer = setInterval(() => {
					this.requestPushAll();
				}, 15000);
			});
		});

		this.client.on("reconnect", () => this.log("reconectando..."));
		this.client.on("close", () => {
			this.log("conexion cerrada");
			this.emit("disconnected");
		});
		this.client.on("error", (err) => {
			this.log("error:", err.message);
			this.emit("error", err);
			if (/not authorized|bad user name or password|bad credentials/i.test(err.message)) {
				this.client?.end(true);
			}
		});

		this.client.on("message", (_topic, payload) => {
			let msg: any;
			try {
				msg = JSON.parse(payload.toString("utf8"));
			} catch (err) {
				return;
			}

			const print = msg?.print;
			if (!print) return;

			this.cumulativeTelemetry.timestamp = Date.now();
			this.cumulativeTelemetry.raw = msg;

			const newGcodeState = parseGcodeState(print.gcode_state);
			if (newGcodeState) {
				this.cumulativeTelemetry.gcodeState = newGcodeState;
				this.cumulativeTelemetry.printing = newGcodeState === "RUNNING" || newGcodeState === "PAUSE" || newGcodeState === "PREPARE";
			}

			if (typeof print.mc_percent === "number") this.cumulativeTelemetry.progressPercent = print.mc_percent;
			if (typeof print.mc_remaining_time === "number") this.cumulativeTelemetry.remainingMinutes = print.mc_remaining_time;
			if (typeof print.layer_num === "number") this.cumulativeTelemetry.layerNum = print.layer_num;
			if (typeof print.total_layer_num === "number") this.cumulativeTelemetry.totalLayers = print.total_layer_num;
			if (typeof print.subtask_name === "string" && print.subtask_name) this.cumulativeTelemetry.subtaskName = print.subtask_name;
			if (print.spd_lvl !== undefined) this.cumulativeTelemetry.speedLevel = Number(print.spd_lvl);

			if (typeof print.nozzle_temper === "number") this.cumulativeTelemetry.nozzleTempC = print.nozzle_temper;
			if (typeof print.nozzle_target_temper === "number") this.cumulativeTelemetry.nozzleTargetC = print.nozzle_target_temper;
			if (typeof print.bed_temper === "number") this.cumulativeTelemetry.bedTempC = print.bed_temper;
			if (typeof print.bed_target_temper === "number") this.cumulativeTelemetry.bedTargetC = print.bed_target_temper;

			if (print.cooling_fan_speed !== undefined) this.cumulativeTelemetry.fans.coolingPercent = fanPercent(print.cooling_fan_speed);
			if (print.big_fan1_speed !== undefined) this.cumulativeTelemetry.fans.auxPercent = fanPercent(print.big_fan1_speed);
			if (print.big_fan2_speed !== undefined) this.cumulativeTelemetry.fans.chamberPercent = fanPercent(print.big_fan2_speed);
			if (print.heatbreak_fan_speed !== undefined) this.cumulativeTelemetry.fans.heatbreakPercent = fanPercent(print.heatbreak_fan_speed);

			const amsParsed = parseAms(print);
			if (amsParsed) {
				if (!this.cumulativeTelemetry.ams) {
					this.cumulativeTelemetry.ams = amsParsed;
				} else {
					if (amsParsed.units && amsParsed.units.length > 0) {
						amsParsed.units.forEach((newUnit, uIdx) => {
							const existingUnit = this.cumulativeTelemetry.ams!.units[uIdx];
							if (!existingUnit) {
								this.cumulativeTelemetry.ams!.units[uIdx] = newUnit;
							} else {
								if (newUnit.humidityPercent !== null && newUnit.humidityPercent !== undefined) {
									existingUnit.humidityPercent = newUnit.humidityPercent;
								}
								if (newUnit.tempC !== null && newUnit.tempC !== undefined) {
									existingUnit.tempC = newUnit.tempC;
								}
								if (newUnit.trays && newUnit.trays.length > 0) {
									existingUnit.trays = newUnit.trays;
								}
							}
						});
					}
					if (amsParsed.activeTrayIndex !== null) this.cumulativeTelemetry.ams.activeTrayIndex = amsParsed.activeTrayIndex;
					if (amsParsed.externalSpool) this.cumulativeTelemetry.ams.externalSpool = amsParsed.externalSpool;
				}
			}

			const rawChamber =
				print.chamber_temper ??
				print.mc_temper ??
				print.chamber_temp ??
				print.chamber_temperature ??
				print.box_temper ??
				print.box_temp ??
				print.ctc?.info?.temp ??
				print.ctc?.temp ??
				this.cumulativeTelemetry.ams?.units?.[0]?.tempC;

			if (rawChamber !== undefined && rawChamber !== null) {
				const strVal = String(rawChamber).trim();
				if (strVal !== "" && strVal !== "null" && strVal !== "undefined") {
					const parsed = parseFloat(strVal);
					if (!isNaN(parsed) && parsed > 0) {
						this.cumulativeTelemetry.chamberTempC = Math.round(parsed);
					}
				}
			}

			this.emit("telemetry", { ...this.cumulativeTelemetry });
		});
	}

	requestPushAll(): void {
		if (!this.client?.connected) return;
		const topic = `device/${this.options.deviceSerial}/request`;
		const payload = JSON.stringify({
			pushing: {
				sequence_id: String(this.pushallSeq++),
				command: "pushall",
			},
		});
		this.client.publish(topic, payload);
		this.log("pushall enviado");
	}

	disconnect(): void {
		if (this.pushallTimer) {
			clearInterval(this.pushallTimer);
			this.pushallTimer = null;
		}
		this.client?.end(true);
		this.client = null;
	}
}
