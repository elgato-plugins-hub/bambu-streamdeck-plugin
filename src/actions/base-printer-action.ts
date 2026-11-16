import streamDeck, {
	DidReceiveSettingsEvent,
	KeyAction,
	KeyDownEvent,
	SendToPluginEvent,
	SingletonAction,
	WillAppearEvent,
	WillDisappearEvent,
} from "@elgato/streamdeck";

import { cloudLogin, cloudVerifyCode, fetchDevices } from "../bambu-auth";
import { BambuCloudService } from "../bambu-cloud-service";
import { ERROR_COLOR, renderPlaceholder } from "../render";
import type { BambuTelemetry, CloudRegion } from "../types";
import { t } from "../i18n";

export type BambuGlobalSettings = {
	[key: string]: any;
	userToken?: string;
	accountEmail?: string;
	region?: CloudRegion;
	deviceSerial?: string;
	userId?: string;
};

export type BaseActionSettings = {
	[key: string]: any;
	userToken?: string;
	deviceSerial?: string;
	region?: CloudRegion;
	accountEmail?: string;
};

export interface Connection {
	service: BambuCloudService;
	key: string;
	lastTelemetry: BambuTelemetry | null;
	viewIndex: number;
}

export abstract class BasePrinterAction<TSettings extends BaseActionSettings = BaseActionSettings> extends SingletonAction<TSettings> {
	protected static connections = new Map<string, Connection>();

	protected abstract renderTelemetryImage(telemetry: BambuTelemetry | null, conn?: Connection): string;

	protected async safeSetImage(keyAction: KeyAction<TSettings>, image: string, label: string): Promise<void> {
		try {
			await keyAction.setImage(image);
			await keyAction.setTitle("");
		} catch (err) {
			streamDeck.logger.error(`[action:${label}] setImage failed: ${(err as Error).message}`);
		}
	}

	protected async safeShowAlert(keyAction: KeyAction<TSettings>, label: string): Promise<void> {
		try {
			await keyAction.showAlert();
		} catch (err) {
			streamDeck.logger.error(`[action:${label}] showAlert failed: ${(err as Error).message}`);
		}
	}

	override async onWillAppear(ev: WillAppearEvent<TSettings>): Promise<void> {
		if (!ev.action.isKey()) return;
		await this.sync(ev.action, ev.payload.settings);
	}

	override onWillDisappear(ev: WillDisappearEvent<TSettings>): void {
		this.teardown(ev.action.id);
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<TSettings>): Promise<void> {
		if (!ev.action.isKey()) return;
		await this.sync(ev.action, ev.payload.settings);
	}

	override async onKeyDown(ev: KeyDownEvent<TSettings>): Promise<void> {
		if (!ev.action.isKey()) return;
		const conn = BasePrinterAction.connections.get(ev.action.id);
		if (!conn) return;
		void this.safeSetImage(ev.action, this.renderTelemetryImage(conn.lastTelemetry, conn), ev.action.id);
		conn.service.requestPushAll();
	}

	override async onSendToPlugin(ev: SendToPluginEvent<any, TSettings>): Promise<void> {
		const payload = ev.payload;
		if (!payload || typeof payload !== "object") return;

		const eventType = payload.event;
		const region: CloudRegion = payload.region ?? "us";

		if (eventType === "login") {
			const res = await cloudLogin(region, payload.account, payload.password);
			if (res.success && res.token) {
				const firstSerial = res.devices && res.devices.length > 0 ? res.devices[0].dev_id : undefined;
				await streamDeck.settings.setGlobalSettings({
					userToken: res.token,
					accountEmail: payload.account,
					region,
					deviceSerial: firstSerial,
				});
				await ev.action.setSettings({
					...ev.payload.settings,
					userToken: res.token,
					accountEmail: payload.account,
					region,
					deviceSerial: firstSerial,
				} as any);
			}
			await streamDeck.ui.sendToPropertyInspector({ event: "loginResult", ...res });
		} else if (eventType === "verifyCode") {
			const res = await cloudVerifyCode(region, payload.account, payload.code, payload.loginType, payload.tfaKey);
			if (res.success && res.token) {
				const firstSerial = res.devices && res.devices.length > 0 ? res.devices[0].dev_id : undefined;
				await streamDeck.settings.setGlobalSettings({
					userToken: res.token,
					accountEmail: payload.account,
					region,
					deviceSerial: firstSerial,
				});
				await ev.action.setSettings({
					...ev.payload.settings,
					userToken: res.token,
					accountEmail: payload.account,
					region,
					deviceSerial: firstSerial,
				} as any);
			}
			await streamDeck.ui.sendToPropertyInspector({ event: "loginResult", ...res });
		} else if (eventType === "logout") {
			await streamDeck.settings.setGlobalSettings({});
			await streamDeck.ui.sendToPropertyInspector({ event: "logoutResult", success: true });
		} else if (eventType === "fetchDevices") {
			try {
				const globals = await streamDeck.settings.getGlobalSettings<BambuGlobalSettings>();
				const token = payload.token || globals.userToken || ev.payload.settings.userToken;
				if (!token) throw new Error(t("No saved session token"));
				const devices = await fetchDevices(region, token);
				if (devices.length > 0 && !globals.deviceSerial) {
					await streamDeck.settings.setGlobalSettings({
						...globals,
						deviceSerial: devices[0].dev_id,
					});
				}
				await streamDeck.ui.sendToPropertyInspector({ event: "devicesResult", success: true, devices });
			} catch (err) {
				await streamDeck.ui.sendToPropertyInspector({ event: "devicesResult", success: false, error: (err as Error).message });
			}
		}
	}

	protected async sync(keyAction: KeyAction<TSettings>, settings: TSettings): Promise<void> {
		const actionId = keyAction.id;
		const globals = await streamDeck.settings.getGlobalSettings<BambuGlobalSettings>();

		const userToken = settings.userToken || globals.userToken;
		const region = settings.region || globals.region || "us";
		const deviceSerial = settings.deviceSerial || globals.deviceSerial;
		const rawUserId = String(settings.userId || globals.userId || "").trim();
		const userId = rawUserId ? (/^u_/i.test(rawUserId) ? rawUserId : `u_${rawUserId}`) : undefined;

		if (globals.userToken && (!settings.userToken || !settings.deviceSerial)) {
			await keyAction.setSettings({
				...settings,
				userToken: globals.userToken,
				accountEmail: globals.accountEmail,
				region: globals.region,
				deviceSerial: deviceSerial,
			} as any);
		}

		const key = userToken && deviceSerial ? `${userToken}::${deviceSerial}::${region}::${userId ?? ""}` : null;
		const existing = BasePrinterAction.connections.get(actionId);

		if (!key) {
			if (existing) this.teardown(actionId);
			const msg = !userToken ? t("Sign In\nRequired") : t("Select\nPrinter");
			await this.safeSetImage(keyAction, renderPlaceholder(msg), actionId);
			return;
		}

		if (existing?.key === key) {
			await this.safeSetImage(keyAction, this.renderTelemetryImage(existing.lastTelemetry, existing), actionId);
			return;
		}

		if (existing) this.teardown(actionId);

		streamDeck.logger.info(`[action:${actionId}] Connecting MQTT to Bambu Cloud for serial=${deviceSerial}`);
		const service = new BambuCloudService({
			userToken: userToken!,
			deviceSerial: deviceSerial!,
			region,
			userId,
			debug: true,
		});
		const conn: Connection = { service, key, lastTelemetry: null, viewIndex: 0 };
		BasePrinterAction.connections.set(actionId, conn);

		service.on("telemetry", (t: BambuTelemetry) => {
			conn.lastTelemetry = t;
			void this.safeSetImage(keyAction, this.renderTelemetryImage(t, conn), actionId);
		});
		service.on("error", (err: Error) => {
			streamDeck.logger.error(`[action:${actionId}] MQTT Error: ${err.message}`);
			void this.safeSetImage(keyAction, renderPlaceholder(t("Connection\nError"), ERROR_COLOR), actionId);
			void this.safeShowAlert(keyAction, actionId);
		});

		await this.safeSetImage(keyAction, renderPlaceholder(t("Connecting...")), actionId);
		try {
			await service.connect();
		} catch (err) {
			streamDeck.logger.error(`[action:${actionId}] Connect Error: ${(err as Error).message}`);
			await this.safeSetImage(keyAction, renderPlaceholder(t("Token\nError"), ERROR_COLOR), actionId);
		}
	}

	protected teardown(actionId: string): void {
		const existing = BasePrinterAction.connections.get(actionId);
		if (!existing) return;
		existing.service.disconnect();
		BasePrinterAction.connections.delete(actionId);
	}
}
