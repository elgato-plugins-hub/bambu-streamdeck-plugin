import streamDeck from "@elgato/streamdeck";

import { BambuCloudService } from "./bambu-cloud-service";
import type { BambuTelemetry, CloudRegion } from "./types";

// Keep the MQTT connection alive briefly after the last key disappears, so switching
// Stream Deck pages/profiles doesn't cause a disconnect/reconnect storm.
const IDLE_DISCONNECT_MS = 30_000;

export interface PrinterParams {
	userToken: string;
	deviceSerial: string;
	region: CloudRegion;
}

export interface PrinterListener {
	onTelemetry(telemetry: BambuTelemetry): void;
	onError(err: Error): void;
	onConnectFailed(err: Error): void;
}

const printers = new Map<string, SharedPrinter>();

export function printerKey(params: PrinterParams): string {
	return `${params.userToken}::${params.deviceSerial}::${params.region}`;
}

/**
 * One Bambu Cloud MQTT connection per printer, shared by every key that shows data
 * from it. Previously each key opened its own connection and polled independently.
 */
export class SharedPrinter {
	readonly service: BambuCloudService;
	lastTelemetry: BambuTelemetry | null = null;

	private readonly listeners = new Map<string, PrinterListener>();
	private idleTimer: NodeJS.Timeout | null = null;

	constructor(
		readonly key: string,
		private readonly params: PrinterParams,
	) {
		this.service = new BambuCloudService({ ...params, debug: true });
		this.service.on("connected", () => {
			streamDeck.logger.info(`[printer:${params.deviceSerial}] MQTT connected, ${this.listeners.size} key(s) attached`);
		});
		this.service.on("telemetry", (t: BambuTelemetry) => {
			if (!this.lastTelemetry) {
				streamDeck.logger.info(`[printer:${params.deviceSerial}] First telemetry received (state=${t.gcodeState})`);
			}
			this.lastTelemetry = t;
			for (const l of this.listeners.values()) l.onTelemetry(t);
		});
		this.service.on("error", (err: Error) => {
			streamDeck.logger.error(`[printer:${params.deviceSerial}] MQTT Error: ${err.message}`);
			for (const l of this.listeners.values()) l.onError(err);
		});
	}

	/** True while this is the live connection for its key (false once closed or failed). */
	get active(): boolean {
		return printers.get(this.key) === this;
	}

	start(): void {
		streamDeck.logger.info(`[printer:${this.params.deviceSerial}] Connecting MQTT to Bambu Cloud`);
		this.service.connect().catch((err: Error) => {
			streamDeck.logger.error(`[printer:${this.params.deviceSerial}] Connect Error: ${err.message}`);
			// Drop it from the pool so the next sync retries with a fresh connection.
			this.close();
			for (const l of this.listeners.values()) l.onConnectFailed(err);
		});
	}

	addListener(actionId: string, listener: PrinterListener): void {
		if (this.idleTimer) {
			clearTimeout(this.idleTimer);
			this.idleTimer = null;
		}
		this.listeners.set(actionId, listener);
	}

	removeListener(actionId: string): void {
		this.listeners.delete(actionId);
		if (this.listeners.size > 0 || this.idleTimer || !this.active) return;
		this.idleTimer = setTimeout(() => {
			this.idleTimer = null;
			if (this.listeners.size === 0) this.close();
		}, IDLE_DISCONNECT_MS);
	}

	private close(): void {
		if (this.idleTimer) {
			clearTimeout(this.idleTimer);
			this.idleTimer = null;
		}
		if (this.active) {
			printers.delete(this.key);
			streamDeck.logger.info(`[printer:${this.params.deviceSerial}] Disconnecting MQTT`);
		}
		this.service.disconnect();
	}
}

/** Returns the shared connection for these params, creating it if needed, and registers the listener. */
export function acquirePrinter(actionId: string, params: PrinterParams, listener: PrinterListener): SharedPrinter {
	const key = printerKey(params);
	let printer = printers.get(key);
	if (!printer) {
		printer = new SharedPrinter(key, params);
		printers.set(key, printer);
		printer.start();
	}
	printer.addListener(actionId, listener);
	return printer;
}
