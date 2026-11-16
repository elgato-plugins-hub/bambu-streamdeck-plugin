import { action } from "@elgato/streamdeck";
import { BasePrinterAction, BaseActionSettings } from "./base-printer-action";
import { renderAmsSlotView, renderPlaceholder } from "../render";
import type { BambuTelemetry } from "../types";
import { t } from "../i18n";

@action({ UUID: "com.alejandrocabo.bambuconnect.ams-slot-1" })
export class AmsSlot1 extends BasePrinterAction<BaseActionSettings> {
	protected renderTelemetryImage(telemetry: BambuTelemetry | null): string {
		if (!telemetry) return renderPlaceholder(t("No Data"));
		return renderAmsSlotView(telemetry, 0);
	}
}
