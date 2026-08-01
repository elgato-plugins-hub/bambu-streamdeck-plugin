import { action } from "@elgato/streamdeck";
import { BasePrinterAction, BaseActionSettings } from "./base-printer-action";
import { renderSubtaskView, renderPlaceholder } from "../render";
import type { BambuTelemetry } from "../types";

@action({ UUID: "com.alejandrocabo.bambuconnect.subtask-info" })
export class SubtaskInfo extends BasePrinterAction<BaseActionSettings> {
	protected renderTelemetryImage(telemetry: BambuTelemetry | null): string {
		if (!telemetry) return renderPlaceholder("No Data");
		return renderSubtaskView(telemetry);
	}
}
