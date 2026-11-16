import streamDeck from "@elgato/streamdeck";
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
	NozzleReading,
	NozzleSide,
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
	if (parts.length < 2) {
		streamDeck.logger.warn(`[decodeJwtUserId] token is not a JWT (segments=${parts.length}, length=${token.length})`);
		return null;
	}
	try {
		const payloadJson = Buffer.from(parts[1], "base64url").toString("utf8");
		const payload = JSON.parse(payloadJson);
		const named = typeof payload.username === "string" && /^u_\d+$/.test(payload.username) ? payload.username : null;
		if (named) return named;
		const uid = payload.uid ?? payload.sub ?? payload.user_id;
		if (uid === undefined || uid === null || uid === "") {
			streamDeck.logger.warn(`[decodeJwtUserId] no user id claim; payload keys=${Object.keys(payload).join(",")}`);
			return null;
		}
		return `u_${uid}`;
	} catch (e) {
		streamDeck.logger.warn(`[decodeJwtUserId] could not decode token payload: ${(e as Error).message}`);
		return null;
	}
}

async function fetchUserIdFromProfile(token: string, region: CloudRegion): Promise<string | null> {
	const url = `${apiBase(region)}/v1/user-service/my/profile`;
	try {
		const res = await fetch(url, {
			headers: {
				Authorization: `Bearer ${token}`,
				"User-Agent": "bambu_network_agent/01.09.05.01",
				"X-BBL-Client-Name": "OrcaSlicer",
				"X-BBL-Client-Type": "slicer",
				Accept: "application/json",
			},
			signal: AbortSignal.timeout(15000),
		});
		const text = await res.text();
		streamDeck.logger.info(`[fetchUserIdFromProfile] GET ${url} -> ${res.status}; body=${text.slice(0, 120).replace(/\s+/g, " ")}`);
		if (!res.ok) return null;
		let body: any;
		try {
			body = JSON.parse(text);
		} catch {
			return null;
		}
		const src = body?.data && typeof body.data === "object" ? body.data : body;
		const uid = src?.uidStr ?? src?.uid ?? src?.user_id ?? src?.userId;
		if (uid === undefined || uid === null || uid === "") {
			streamDeck.logger.warn(`[fetchUserIdFromProfile] no uid field; keys=${Object.keys(src ?? {}).join(",")}`);
			return null;
		}
		return `u_${uid}`;
	} catch (e) {
		streamDeck.logger.error(`[fetchUserIdFromProfile] request failed: ${(e as Error).message}`);
		return null;
	}
}

/** Splits a packed temperature word: low 16 bits are the current value, high 16 bits the target. */
export function unpackTemperature(packed: number): NozzleReading {
	return { tempC: packed & 0xffff, targetC: (packed >>> 16) & 0xffff };
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
	/** Light node reported by the printer (chamber_light, work_light...), used for ledctrl commands. */
	private lightNode = "chamber_light";
	private ledSeq = 2000;
	/** Set once the printer reports more than one extruder; the legacy single-nozzle fields then stop being trusted. */
	private dualNozzle = false;
	private nozzleReadings: Record<NozzleSide, NozzleReading> = {
		right: { tempC: null, targetC: null },
		left: { tempC: null, targetC: null },
	};
	private activeNozzle: NozzleSide | null = null;
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
			nozzles: null,
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
				this.log("token is not a decodable JWT, trying /profile...");
				this.userId = await fetchUserIdFromProfile(this.options.userToken, this.options.region);
			}
			if (!this.userId) {
				throw new Error("Could not resolve the Bambu user ID from the token");
			}
			this.log("userId resuelto:", this.userId);
		}

		const host = brokerHost(this.options.region);
		const clientId = `bblp_${randomBytes(6).toString("hex")}`;

		this.log(`connecting to mqtts://${host}:${BAMBU_PORT} as ${this.userId}`);

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
				this.log("subscribed to", topic);
				this.emit("connected");
				if (this.options.pushAllOnConnect) this.requestPushAll();

				if (this.pushallTimer) clearInterval(this.pushallTimer);
				this.pushallTimer = setInterval(() => {
					this.requestPushAll();
				}, 15000);
			});
		});

		this.client.on("reconnect", () => this.log("reconnecting..."));
		this.client.on("close", () => {
			this.log("connection closed");
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

			this.parseExtruders(print);
			// On dual-nozzle printers the legacy fields only describe whichever nozzle is active, so they must not
			// overwrite the per-nozzle readings.
			if (!this.dualNozzle) {
				if (typeof print.nozzle_temper === "number") this.cumulativeTelemetry.nozzleTempC = print.nozzle_temper;
				if (typeof print.nozzle_target_temper === "number") this.cumulativeTelemetry.nozzleTargetC = print.nozzle_target_temper;
			}
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

			if (Array.isArray(print.lights_report)) {
				const lights = print.lights_report as Array<{ node?: string; mode?: string }>;
				const main = lights.find((l) => l?.node === "chamber_light") ?? lights.find((l) => l?.node === "work_light") ?? lights.find((l) => typeof l?.node === "string");
				if (main?.node) {
					this.lightNode = main.node;
					this.cumulativeTelemetry.lightOn = main.mode === "on" || main.mode === "flashing" || main.mode === "flash";
				}
			}

			this.emit("telemetry", { ...this.cumulativeTelemetry });
		});
	}

	/**
	 * Reads device.extruder: `info[]` has one entry per nozzle (id 0 = right, id 1 = left) whose `temp` packs the
	 * current temperature in the low 16 bits and the target in the high 16 bits; `state` holds the extruder count
	 * in its low 4 bits and the active nozzle in the next 4 (15 while switching).
	 */
	private parseExtruders(print: any): void {
		const extruder = print?.device?.extruder;
		if (!extruder) return;

		const info: any[] = Array.isArray(extruder.info) ? extruder.info : [];
		const state = typeof extruder.state === "number" ? extruder.state : null;
		if (info.length >= 2 || (state !== null && (state & 0xf) >= 2)) this.dualNozzle = true;

		const sides: Record<number, NozzleSide> = { 0: "right", 1: "left" };
		for (const entry of info) {
			const side = sides[entry?.id as number];
			if (!side || typeof entry.temp !== "number") continue;
			this.nozzleReadings[side] = unpackTemperature(entry.temp);
		}

		if (state !== null) {
			const index = (state >> 4) & 0xf;
			if (index === 0 || index === 1) this.activeNozzle = sides[index];
		}

		if (!this.dualNozzle) {
			// Newer firmware reports even a single nozzle here.
			const only = this.nozzleReadings.right;
			if (only.tempC !== null) {
				this.cumulativeTelemetry.nozzleTempC = only.tempC;
				this.cumulativeTelemetry.nozzleTargetC = only.targetC;
			}
			return;
		}

		const active = this.activeNozzle ?? "right";
		this.cumulativeTelemetry.nozzles = {
			dual: true,
			active: this.activeNozzle,
			left: { ...this.nozzleReadings.left },
			right: { ...this.nozzleReadings.right },
		};
		this.cumulativeTelemetry.nozzleTempC = this.nozzleReadings[active].tempC;
		this.cumulativeTelemetry.nozzleTargetC = this.nozzleReadings[active].targetC;
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
		this.log("pushall sent");
	}

	/** Switches the printer light on or off (chamber light, or work light on printers without one). */
	setLight(on: boolean): boolean {
		if (!this.client?.connected) return false;
		const topic = `device/${this.options.deviceSerial}/request`;
		const payload = JSON.stringify({
			system: {
				sequence_id: String(this.ledSeq++),
				command: "ledctrl",
				led_node: this.lightNode,
				led_mode: on ? "on" : "off",
				led_on_time: 500,
				led_off_time: 500,
				loop_times: 0,
				interval_time: 0,
			},
		});
		this.client.publish(topic, payload);
		this.log(`ledctrl ${this.lightNode} ${on ? "on" : "off"} sent`);
		// Optimistic update so the key responds immediately; the next printer report confirms it.
		this.cumulativeTelemetry.lightOn = on;
		this.emit("telemetry", { ...this.cumulativeTelemetry });
		return true;
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
