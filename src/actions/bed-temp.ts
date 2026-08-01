import { action } from "@elgato/streamdeck";
import { BasePrinterAction, BaseActionSettings } from "./base-printer-action";
import { renderBedTempView, renderPlaceholder } from "../render";
import type { BambuTelemetry } from "../types";

@action({ UUID: "com.alejandrocabo.bambuconnect.bed-temp" })
export class BedTemp extends BasePrinterAction<BaseActionSettings> {
	protected renderTelemetryImage(telemetry: BambuTelemetry | null): string {
		if (!telemetry) return renderPlaceholder("Sin datos");
		return renderBedTempView(telemetry);
	}
}
