import streamDeck, { action, KeyDownEvent } from "@elgato/streamdeck";
import { BasePrinterAction, BaseActionSettings } from "./base-printer-action";
import { renderLightView, renderPlaceholder } from "../render";
import type { BambuTelemetry } from "../types";
import { t } from "../i18n";

@action({ UUID: "com.alejandrocabo.bambuconnect.light-toggle" })
export class LightToggle extends BasePrinterAction<BaseActionSettings> {
	protected renderTelemetryImage(telemetry: BambuTelemetry | null): string {
		if (!telemetry) return renderPlaceholder(t("No Data"));
		return renderLightView(telemetry);
	}

	override async onKeyDown(ev: KeyDownEvent<BaseActionSettings>): Promise<void> {
		if (!ev.action.isKey()) return;
		const conn = BasePrinterAction.connections.get(ev.action.id);
		if (!conn) return;

		// Without a known state yet, ask for one instead of guessing which way to switch.
		if (conn.lastTelemetry?.lightOn === null || conn.lastTelemetry?.lightOn === undefined) {
			conn.service.requestPushAll();
			return;
		}
		const next = !conn.lastTelemetry.lightOn;
		if (!conn.service.setLight(next)) {
			streamDeck.logger.error(`[action:${ev.action.id}] light command not sent: not connected`);
			await ev.action.showAlert();
		}
	}
}
