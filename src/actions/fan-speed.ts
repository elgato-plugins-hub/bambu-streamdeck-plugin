import { action } from "@elgato/streamdeck";
import { BasePrinterAction, BaseActionSettings } from "./base-printer-action";
import { renderFanControlView, renderPlaceholder } from "../render";
import type { BambuTelemetry } from "../types";
import { t } from "../i18n";

@action({ UUID: "com.alejandrocabo.bambuconnect.fan-speed" })
export class FanSpeed extends BasePrinterAction<BaseActionSettings> {
	protected renderTelemetryImage(telemetry: BambuTelemetry | null): string {
		if (!telemetry) return renderPlaceholder(t("No Data"));
		return renderFanControlView(telemetry);
	}
}
