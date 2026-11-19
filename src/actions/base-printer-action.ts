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
import { acquirePrinter, printerKey, SharedPrinter } from "../printer-pool";
import { ERROR_COLOR, renderPlaceholder } from "../render";
import type { BambuTelemetry, CloudRegion } from "../types";

export type BambuGlobalSettings = {
	[key: string]: any;
	userToken?: string;
	accountEmail?: string;
	region?: CloudRegion;
	deviceSerial?: string;
};

export type BaseActionSettings = {
	[key: string]: any;
	userToken?: string;
	deviceSerial?: string;
	region?: CloudRegion;
	accountEmail?: string;
};

/** Per-key view of a printer connection that is shared with every other key showing the same printer. */
export interface Connection {
	printer: SharedPrinter;
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
		void this.safeSetImage(ev.action, this.renderTelemetryImage(conn.printer.lastTelemetry, conn), ev.action.id);
		conn.printer.service.requestPushAll();
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
				if (!token) throw new Error("No saved session token");
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

		if (globals.userToken && (!settings.userToken || !settings.deviceSerial)) {
			await keyAction.setSettings({
				...settings,
				userToken: globals.userToken,
				accountEmail: globals.accountEmail,
				region: globals.region,
				deviceSerial: deviceSerial,
			} as any);
		}

		const existing = BasePrinterAction.connections.get(actionId);

		if (!userToken || !deviceSerial) {
			if (existing) this.teardown(actionId);
			const msg = !userToken ? "Sign In\nRequired" : "Select\nPrinter";
			await this.safeSetImage(keyAction, renderPlaceholder(msg), actionId);
			return;
		}

		const params = { userToken, deviceSerial, region };
		if (existing && existing.printer.key === printerKey(params) && existing.printer.active) {
			await this.safeSetImage(keyAction, this.renderTelemetryImage(existing.printer.lastTelemetry, existing), actionId);
			return;
		}

		if (existing) this.teardown(actionId);

		const conn = { viewIndex: 0 } as Connection;
		conn.printer = acquirePrinter(actionId, params, {
			onTelemetry: (t: BambuTelemetry) => {
				void this.safeSetImage(keyAction, this.renderTelemetryImage(t, conn), actionId);
			},
			onError: () => {
				void this.safeSetImage(keyAction, renderPlaceholder("Connection\nError", ERROR_COLOR), actionId);
				void this.safeShowAlert(keyAction, actionId);
			},
			onConnectFailed: (err: Error) => {
				const msg = /cloudflare/i.test(err.message) ? "Cloud\nBlocked" : "Token\nError";
				void this.safeSetImage(keyAction, renderPlaceholder(msg, ERROR_COLOR), actionId);
			},
		});
		BasePrinterAction.connections.set(actionId, conn);

		const telemetry = conn.printer.lastTelemetry;
		await this.safeSetImage(keyAction, telemetry ? this.renderTelemetryImage(telemetry, conn) : renderPlaceholder("Connecting..."), actionId);
	}

	protected teardown(actionId: string): void {
		const existing = BasePrinterAction.connections.get(actionId);
		if (!existing) return;
		existing.printer.removeListener(actionId);
		BasePrinterAction.connections.delete(actionId);
	}
}
