import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Size (px) of the square key image. 144 covers the largest Stream Deck key (2x). */
export const KEY_SIZE = 144;
const RTSPS_PORT = 322;
const STALL_TIMEOUT_MS = 15_000;
/** ffmpeg socket timeout (microseconds): fails fast when the printer is unreachable or the stream stalls. */
const IO_TIMEOUT_US = 10_000_000;
const MIN_RETRY_MS = 3_000;
const MAX_RETRY_MS = 30_000;

export interface CameraStreamOptions {
	/** Printer IP address or hostname on the local network. */
	host: string;
	/** LAN access code shown on the printer screen. */
	accessCode: string;
	/** Frames per second sent to the key. */
	fps?: number;
	/** Optional ffmpeg executable path; otherwise the bundled build, then PATH. */
	ffmpegPath?: string;
	/** Overrides the RTSPS URL (used by tests with a synthetic source). */
	inputOverride?: string[];
}

export interface CameraStreamEvents {
	frame: (jpeg: Buffer) => void;
	status: (status: "connecting" | "streaming" | "error", detail?: string) => void;
}

/** Host names and IPv4/IPv6 literals only: keeps unexpected characters out of the stream URL. */
export function isValidHost(host: string): boolean {
	return /^[A-Za-z0-9]([A-Za-z0-9.\-]{0,251}[A-Za-z0-9])?$/.test(host) || /^[0-9A-Fa-f:]+$/.test(host);
}

export function bundledFfmpegPath(): string {
	const exe = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
	return path.join(process.cwd(), "bin", "ffmpeg", exe);
}

/** Resolves the ffmpeg executable: explicit setting, bundled binary, then whatever is on PATH. */
export function resolveFfmpeg(explicit?: string): string {
	if (explicit && explicit.trim()) return explicit.trim();
	const bundled = bundledFfmpegPath();
	if (fs.existsSync(bundled)) return bundled;
	return process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
}

export function buildStreamUrl(host: string, accessCode: string): string {
	return `rtsps://bblp:${encodeURIComponent(accessCode)}@${host}:${RTSPS_PORT}/streaming/live/1`;
}

/** Removes the access code from text that may contain the stream URL (logs, ffmpeg errors). */
export function redact(text: string, accessCode: string): string {
	let out = text.replace(/rtsps?:\/\/[^@\s]*@/gi, "rtsps://***@");
	if (accessCode) out = out.split(accessCode).join("***").split(encodeURIComponent(accessCode)).join("***");
	return out;
}

/** Splits a stream of concatenated JPEG images into individual frames. */
export class JpegFrameSplitter {
	private buffer: Buffer = Buffer.alloc(0);

	push(chunk: Buffer): Buffer[] {
		this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
		const frames: Buffer[] = [];
		for (;;) {
			const start = this.buffer.indexOf(Buffer.from([0xff, 0xd8]));
			if (start < 0) {
				this.buffer = Buffer.alloc(0);
				break;
			}
			const end = this.buffer.indexOf(Buffer.from([0xff, 0xd9]), start + 2);
			if (end < 0) {
				this.buffer = this.buffer.subarray(start);
				break;
			}
			frames.push(this.buffer.subarray(start, end + 2));
			this.buffer = this.buffer.subarray(end + 2);
		}
		return frames;
	}
}

/**
 * Pulls the printer's RTSPS camera stream with ffmpeg and emits small JPEG frames for a key image.
 * Reconnects with a growing delay when the stream stops or stalls.
 */
export class CameraStream extends EventEmitter {
	private proc: ChildProcess | null = null;
	private stopped = true;
	private retryMs = MIN_RETRY_MS;
	private retryTimer: NodeJS.Timeout | null = null;
	private watchdog: NodeJS.Timeout | null = null;
	private lastStderr = "";

	constructor(private readonly options: CameraStreamOptions) {
		super();
	}

	start(): void {
		if (!this.stopped) return;
		this.stopped = false;
		this.retryMs = MIN_RETRY_MS;
		this.launch();
	}

	stop(): void {
		this.stopped = true;
		if (this.retryTimer) clearTimeout(this.retryTimer);
		if (this.watchdog) clearTimeout(this.watchdog);
		this.retryTimer = this.watchdog = null;
		this.killProcess();
	}

	private killProcess(): void {
		const proc = this.proc;
		this.proc = null;
		if (proc && !proc.killed) proc.kill("SIGKILL");
	}

	private armWatchdog(): void {
		if (this.watchdog) clearTimeout(this.watchdog);
		this.watchdog = setTimeout(() => {
			this.lastStderr = this.lastStderr || "No video received (stream stalled).";
			this.killProcess();
		}, STALL_TIMEOUT_MS);
	}

	private launch(): void {
		const { host, accessCode } = this.options;
		const fps = Math.min(Math.max(this.options.fps ?? 3, 1), 10);
		this.emit("status", "connecting");
		this.lastStderr = "";

		const input = this.options.inputOverride ?? [
			"-timeout", String(IO_TIMEOUT_US),
			"-rtsp_transport", "tcp",
			"-fflags", "nobuffer",
			"-flags", "low_delay",
			"-i", buildStreamUrl(host, accessCode),
		];
		const filter = `fps=${fps},scale=${KEY_SIZE}:${KEY_SIZE}:force_original_aspect_ratio=decrease,pad=${KEY_SIZE}:${KEY_SIZE}:(ow-iw)/2:(oh-ih)/2:black`;
		const args = ["-hide_banner", "-loglevel", "error", ...input, "-an", "-vf", filter, "-q:v", "6", "-f", "image2pipe", "-c:v", "mjpeg", "pipe:1"];

		let proc: ChildProcess;
		try {
			proc = spawn(resolveFfmpeg(this.options.ffmpegPath), args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
		} catch (err) {
			this.fail((err as Error).message);
			return;
		}
		this.proc = proc;
		this.armWatchdog();

		const splitter = new JpegFrameSplitter();
		let gotFrame = false;
		proc.stdout?.on("data", (chunk: Buffer) => {
			for (const frame of splitter.push(chunk)) {
				if (!gotFrame) {
					gotFrame = true;
					this.retryMs = MIN_RETRY_MS;
					this.emit("status", "streaming");
				}
				this.armWatchdog();
				this.emit("frame", frame);
			}
		});
		proc.stderr?.on("data", (chunk: Buffer) => {
			this.lastStderr = (this.lastStderr + chunk.toString()).slice(-800);
		});
		proc.on("error", (err) => {
			this.lastStderr = (err as NodeJS.ErrnoException).code === "ENOENT" ? "ffmpeg was not found." : err.message;
		});
		proc.on("close", () => {
			if (this.proc !== proc && this.proc !== null) return;
			this.proc = null;
			if (this.watchdog) clearTimeout(this.watchdog);
			if (this.stopped) return;
			this.fail(this.lastStderr || "The camera stream ended.");
		});
	}

	private fail(detail: string): void {
		this.emit("status", "error", redact(detail.trim(), this.options.accessCode));
		if (this.stopped) return;
		const delay = this.retryMs;
		this.retryMs = Math.min(this.retryMs * 2, MAX_RETRY_MS);
		this.retryTimer = setTimeout(() => {
			this.retryTimer = null;
			if (!this.stopped) this.launch();
		}, delay);
	}
}

/** Saves one full-resolution frame to `folder` and resolves with the file path. */
export async function saveSnapshot(options: Pick<CameraStreamOptions, "host" | "accessCode" | "ffmpegPath" | "inputOverride">, folder: string): Promise<string> {
	fs.mkdirSync(folder, { recursive: true });
	const stamp = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
	const file = path.join(folder, `bambu-camera-${stamp}.jpg`);
	const input = options.inputOverride ?? ["-timeout", String(IO_TIMEOUT_US), "-rtsp_transport", "tcp", "-i", buildStreamUrl(options.host, options.accessCode)];
	const args = ["-hide_banner", "-loglevel", "error", "-y", ...input, "-frames:v", "1", "-q:v", "2", file];

	return new Promise<string>((resolve, reject) => {
		let stderr = "";
		const proc = spawn(resolveFfmpeg(options.ffmpegPath), args, { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
		const timer = setTimeout(() => proc.kill("SIGKILL"), 20_000);
		proc.stderr?.on("data", (c: Buffer) => (stderr = (stderr + c.toString()).slice(-800)));
		proc.on("error", (err) => {
			clearTimeout(timer);
			reject(new Error((err as NodeJS.ErrnoException).code === "ENOENT" ? "ffmpeg was not found." : err.message));
		});
		proc.on("close", (code) => {
			clearTimeout(timer);
			if (code === 0 && fs.existsSync(file)) resolve(file);
			else reject(new Error(redact(stderr.trim() || `ffmpeg exited with code ${code}`, options.accessCode)));
		});
	});
}

export function defaultSnapshotFolder(): string {
	return path.join(os.homedir(), "Pictures", "Bambu Camera");
}
