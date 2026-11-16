import { action } from "@elgato/streamdeck";
import { BasePrinterAction, BaseActionSettings, Connection } from "./base-printer-action";
import { renderAmsSlotView, renderPlaceholder } from "../render";
import type { BambuTelemetry } from "../types";
import { t } from "../i18n";
import { parseUnitSetting } from "../ams";

@action({ UUID: "com.alejandrocabo.bambuconnect.ams-slot-3" })
export class AmsSlot3 extends BasePrinterAction<BaseActionSettings> {
	protected renderTelemetryImage(telemetry: BambuTelemetry | null, conn?: Connection): string {
		if (!telemetry) return renderPlaceholder(t("No Data"));
		return renderAmsSlotView(telemetry, 2, parseUnitSetting(conn?.settings.amsUnit));
	}
}
