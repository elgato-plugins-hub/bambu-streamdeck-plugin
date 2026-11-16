import streamDeck, {
	action,
	DidReceiveSettingsEvent,
	KeyAction,
	KeyDownEvent,
	SingletonAction,
	WillAppearEvent,
	WillDisappearEvent,
} from "@elgato/streamdeck";

import { CameraStream, defaultSnapshotFolder, isValidHost, saveSnapshot } from "../camera-stream";
import { t } from "../i18n";
import { ERROR_COLOR, renderPlaceholder } from "../render";

export type CameraSettings = {
	[key: string]: any;
	printerIp?: string;
	accessCode?: string;
	frameRate?: string | number;
	snapshotFolder?: string;
	ffmpegPath?: string;
};

interface CameraConnection {
	stream: CameraStream;
	signature: string;
	pending: boolean;
	host: string;
	accessCode: string;
	ffmpegPath?: string;
}

@action({ UUID: "com.alejandrocabo.bambuconnect.camera" })
export class Camera extends SingletonAction<CameraSettings> {
	private readonly connections = new Map<string, CameraConnection>();

	override async onWillAppear(ev: WillAppearEvent<CameraSettings>): Promise<void> {
		if (!ev.action.isKey()) return;
		await this.sync(ev.action, ev.payload.settings);
	}

	override onWillDisappear(ev: WillDisappearEvent<CameraSettings>): void {
		this.teardown(ev.action.id);
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<CameraSettings>): Promise<void> {
		if (!ev.action.isKey()) return;
		await this.sync(ev.action, ev.payload.settings);
	}

	override async onKeyDown(ev: KeyDownEvent<CameraSettings>): Promise<void> {
		if (!ev.action.isKey()) return;
		const conn = this.connections.get(ev.action.id);
		if (!conn) {
			await this.sync(ev.action, ev.payload.settings);
			return;
		}
		const folder = (ev.payload.settings.snapshotFolder || "").trim() || defaultSnapshotFolder();
		try {
			const file = await saveSnapshot({ host: conn.host, accessCode: conn.accessCode, ffmpegPath: conn.ffmpegPath }, folder);
			streamDeck.logger.info(`[camera:${ev.action.id}] snapshot saved: ${file}`);
			await ev.action.showOk();
		} catch (err) {
			streamDeck.logger.error(`[camera:${ev.action.id}] snapshot failed: ${(err as Error).message}`);
			await ev.action.showAlert();
		}
	}

	private async safeSetImage(keyAction: KeyAction<CameraSettings>, image: string, label: string): Promise<void> {
		try {
			await keyAction.setImage(image);
			await keyAction.setTitle("");
		} catch (err) {
			streamDeck.logger.error(`[camera:${label}] setImage failed: ${(err as Error).message}`);
		}
	}

	private async sync(keyAction: KeyAction<CameraSettings>, settings: CameraSettings): Promise<void> {
		const actionId = keyAction.id;

		const host = String(settings.printerIp || "").trim();
		const accessCode = String(settings.accessCode || "").trim();
		const fps = Number(settings.frameRate) || 3;
		const ffmpegPath = String(settings.ffmpegPath || "").trim() || undefined;

		if (!host || !accessCode || !isValidHost(host)) {
			this.teardown(actionId);
			await this.safeSetImage(keyAction, renderPlaceholder(t("Camera\nSetup")), actionId);
			return;
		}

		const signature = `${host}|${accessCode}|${fps}|${ffmpegPath ?? ""}`;
		const existing = this.connections.get(actionId);
		if (existing?.signature === signature) return;
		this.teardown(actionId);

		const stream = new CameraStream({ host, accessCode, fps, ffmpegPath });
		const conn: CameraConnection = { stream, signature, pending: false, host, accessCode, ffmpegPath };
		this.connections.set(actionId, conn);

		stream.on("frame", (jpeg: Buffer) => {
			// Drop frames while the previous image is still being delivered so the key never lags behind.
			if (conn.pending) return;
			conn.pending = true;
			void keyAction
				.setImage(`data:image/jpeg;base64,${jpeg.toString("base64")}`)
				.catch((err: Error) => streamDeck.logger.error(`[camera:${actionId}] setImage failed: ${err.message}`))
				.finally(() => {
					conn.pending = false;
				});
		});
		stream.on("status", (status: string, detail?: string, kind?: string) => {
			if (status === "connecting") {
				streamDeck.logger.info(`[camera:${actionId}] connecting to ${host}`);
				void this.safeSetImage(keyAction, renderPlaceholder(t("Connecting...")), actionId);
			} else if (status === "streaming") {
				streamDeck.logger.info(`[camera:${actionId}] streaming`);
			} else if (status === "error") {
				streamDeck.logger.error(`[camera:${actionId}] ${detail ?? "stream error"}`);
				const message = kind === "ffmpeg" ? t("ffmpeg\nMissing") : t("Camera\nError");
				void this.safeSetImage(keyAction, renderPlaceholder(message, ERROR_COLOR), actionId);
			}
		});
		stream.start();
	}

	private teardown(actionId: string): void {
		const existing = this.connections.get(actionId);
		if (!existing) return;
		existing.stream.stop();
		this.connections.delete(actionId);
	}
}
