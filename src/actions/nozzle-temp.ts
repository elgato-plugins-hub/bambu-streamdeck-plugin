import { action } from "@elgato/streamdeck";
import { BasePrinterAction, BaseActionSettings } from "./base-printer-action";
import { renderNozzleTempView, renderPlaceholder } from "../render";
import type { BambuTelemetry } from "../types";

@action({ UUID: "com.alejandrocabo.bambuconnect.nozzle-temp" })
export class NozzleTemp extends BasePrinterAction<BaseActionSettings> {
	protected renderTelemetryImage(telemetry: BambuTelemetry | null): string {
		if (!telemetry) return renderPlaceholder("Sin datos");
		return renderNozzleTempView(telemetry);
	}
}
