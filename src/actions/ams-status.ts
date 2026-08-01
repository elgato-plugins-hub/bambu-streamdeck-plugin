import { action } from "@elgato/streamdeck";
import { BasePrinterAction, BaseActionSettings } from "./base-printer-action";
import { renderAmsView, renderPlaceholder } from "../render";
import type { BambuTelemetry } from "../types";

@action({ UUID: "com.alejandrocabo.bambuconnect.ams-status" })
export class AmsStatus extends BasePrinterAction<BaseActionSettings> {
	protected renderTelemetryImage(telemetry: BambuTelemetry | null): string {
		if (!telemetry) return renderPlaceholder("Sin datos");
		return renderAmsView(telemetry);
	}
}
