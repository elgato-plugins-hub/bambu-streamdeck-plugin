import { action, KeyDownEvent } from "@elgato/streamdeck";
import { BasePrinterAction, BaseActionSettings, Connection } from "./base-printer-action";
import { renderAmsView, renderPlaceholder } from "../render";
import type { BambuTelemetry } from "../types";
import { t } from "../i18n";

@action({ UUID: "com.alejandrocabo.bambuconnect.ams-status" })
export class AmsStatus extends BasePrinterAction<BaseActionSettings> {
	protected renderTelemetryImage(telemetry: BambuTelemetry | null, conn?: Connection): string {
		if (!telemetry) return renderPlaceholder(t("No Data"));
		return renderAmsView(telemetry, conn?.viewIndex ?? 0);
	}

	/** Pressing the key shows the next AMS unit (A, B, C, D, HT...). */
	override async onKeyDown(ev: KeyDownEvent<BaseActionSettings>): Promise<void> {
		if (!ev.action.isKey()) return;
		const conn = BasePrinterAction.connections.get(ev.action.id);
		if (!conn) return;
		const count = conn.lastTelemetry?.ams?.units.length ?? 0;
		if (count > 1) conn.viewIndex = (conn.viewIndex + 1) % count;
		await this.safeSetImage(ev.action, this.renderTelemetryImage(conn.lastTelemetry, conn), ev.action.id);
		conn.service.requestPushAll();
	}
}
