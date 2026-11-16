import { action } from "@elgato/streamdeck";
import { BasePrinterAction, BaseActionSettings } from "./base-printer-action";
import { renderPlaceholder, renderTimeView } from "../render";
import type { BambuTelemetry } from "../types";
import { t } from "../i18n";

@action({ UUID: "com.alejandrocabo.bambuconnect.print-time" })
export class PrintTime extends BasePrinterAction<BaseActionSettings> {
	protected renderTelemetryImage(telemetry: BambuTelemetry | null): string {
		if (!telemetry) return renderPlaceholder(t("No Data"));
		return renderTimeView(telemetry);
	}
}
