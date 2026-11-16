import { action } from "@elgato/streamdeck";
import { BasePrinterAction, BaseActionSettings, Connection } from "./base-printer-action";
import { renderExternalSpoolView, renderPlaceholder } from "../render";
import type { BambuTelemetry } from "../types";
import { t } from "../i18n";
import { parseExternalSetting } from "../ams";

@action({ UUID: "com.alejandrocabo.bambuconnect.ams-external" })
export class AmsExternal extends BasePrinterAction<BaseActionSettings> {
	protected renderTelemetryImage(telemetry: BambuTelemetry | null, conn?: Connection): string {
		if (!telemetry) return renderPlaceholder(t("No Data"));
		return renderExternalSpoolView(telemetry, parseExternalSetting(conn?.settings.externalIndex));
	}
}
