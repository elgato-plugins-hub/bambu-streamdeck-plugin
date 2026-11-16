import { action } from "@elgato/streamdeck";
import { BasePrinterAction, BaseActionSettings } from "./base-printer-action";
import { renderAmsView, renderPlaceholder } from "../render";
import type { BambuTelemetry } from "../types";
import { t } from "../i18n";

@action({ UUID: "com.alejandrocabo.bambuconnect.ams-status" })
export class AmsStatus extends BasePrinterAction<BaseActionSettings> {
	protected renderTelemetryImage(telemetry: BambuTelemetry | null): string {
		if (!telemetry) return renderPlaceholder(t("No Data"));
		return renderAmsView(telemetry);
	}
}
