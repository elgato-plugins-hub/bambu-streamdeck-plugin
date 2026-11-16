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
	/** `kind` tells an ffmpeg problem ("ffmpeg") from a stream/printer problem ("stream") when status is "error". */
	status: (status: "connecting" | "streaming" | "error", detail?: string, kind?: "ffmpeg" | "stream") => void;
}

/** Host names and IPv4/IPv6 literals only: keeps unexpected characters out of the stream URL. */
export function isValidHost(host: string): boolean {
	return /^[A-Za-z0-9]([A-Za-z0-9.\-]{0,251}[A-Za-z0-9])?$/.test(host) || /^[0-9A-Fa-f:]+$/.test(host);
}

export function bundledFfmpegPath(): string {
	const exe = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
	return path.join(process.cwd(), "bin", "ffmpeg", exe);
}

/** Why ffmpeg could not be used: not installed/found, or found but unable to run (permissions, Gatekeeper, wrong architecture). */
export class FfmpegError extends Error {
	constructor(message: string, readonly kind: "missing" | "blocked") {
		super(message);
	}
}

/**
 * Locations checked after the bundled binary. Apps started from the macOS Dock (such as Stream Deck) do not
 * inherit the shell's PATH, so Homebrew's directories have to be tried explicitly.
 */
export function systemFfmpegCandidates(platform: NodeJS.Platform = process.platform): string[] {
	switch (platform) {
		case "darwin":
			return ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/opt/local/bin/ffmpeg", "/usr/bin/ffmpeg"];
		case "win32": {
			// Common install locations (winget, Chocolatey, Scoop, manual). These work even before Stream Deck
			// has been restarted to pick up a PATH change.
			const local = process.env.LOCALAPPDATA;
			const home = process.env.USERPROFILE;
			const programData = process.env.ProgramData ?? "C:\\ProgramData";
			return [
				...(local ? [path.join(local, "Microsoft", "WinGet", "Links", "ffmpeg.exe")] : []),
				path.join(programData, "chocolatey", "bin", "ffmpeg.exe"),
				...(home ? [path.join(home, "scoop", "shims", "ffmpeg.exe")] : []),
				"C:\\ffmpeg\\bin\\ffmpeg.exe",
				"C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe",
			];
		}
		default:
			return ["/usr/bin/ffmpeg", "/usr/local/bin/ffmpeg"];
	}
}

/** Candidate executables in priority order. An explicit path is never silently replaced by another one. */
export function ffmpegCandidates(explicit?: string): string[] {
	const chosen = explicit?.trim();
	if (chosen) return [chosen];
	const list: string[] = [];
	const bundled = bundledFfmpegPath();
	if (fs.existsSync(bundled)) list.push(bundled);
	list.push(...systemFfmpegCandidates());
	list.push(process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg"); // whatever is on PATH
	return list;
}

type ProbeFailure = { ok: false; kind: "missing" | "blocked"; detail: string };
type Probe = { ok: true; version: string } | ProbeFailure;

/** Runs `ffmpeg -version` to prove the executable exists and is allowed to run on this machine. */
function probeFfmpeg(candidate: string): Promise<Probe> {
	return new Promise((resolve) => {
		if (path.isAbsolute(candidate) && !fs.existsSync(candidate)) {
			resolve({ ok: false, kind: "missing", detail: `${candidate} does not exist` });
			return;
		}
		let out = "";
		let settled = false;
		const done = (result: Probe) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve(result);
		};
		let proc: ChildProcess;
		try {
			proc = spawn(candidate, ["-version"], { stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
		} catch (err) {
			resolve({ ok: false, kind: "blocked", detail: (err as Error).message });
			return;
		}
		const timer = setTimeout(() => {
			proc.kill("SIGKILL");
			done({ ok: false, kind: "blocked", detail: `${candidate} did not respond` });
		}, 8_000);
		proc.stdout?.on("data", (c: Buffer) => (out = (out + c.toString()).slice(0, 400)));
		proc.on("error", (err) => {
			const code = (err as NodeJS.ErrnoException).code;
			done(code === "ENOENT" ? { ok: false, kind: "missing", detail: `${candidate} was not found` } : { ok: false, kind: "blocked", detail: `${candidate}: ${err.message}` });
		});
		proc.on("close", (code, signal) => {
			if (code === 0 && /ffmpeg version/i.test(out)) done({ ok: true, version: out.split("\n")[0].trim() });
			else done({ ok: false, kind: "blocked", detail: `${candidate} could not be run (${signal ?? `exit code ${code}`})` });
		});
	});
}

const resolved = new Map<string, string>();

/**
 * Finds a working ffmpeg: the explicit path, else the bundled binary, else the usual system locations, else PATH.
 * Every candidate is probed, so permission problems, macOS Gatekeeper blocks and architecture mismatches are
 * reported clearly instead of surfacing later as an unexplained stream failure.
 */
export async function findFfmpeg(explicit?: string): Promise<string> {
	const key = explicit?.trim() ?? "";
	const cached = resolved.get(key);
	if (cached) return cached;

	const problems: string[] = [];
	let kind: "missing" | "blocked" = "missing";
	for (const candidate of ffmpegCandidates(explicit)) {
		const result = await probeFfmpeg(candidate);
		if (result.ok) {
			resolved.set(key, candidate);
			return candidate;
		}
		const failure = result as ProbeFailure;
		if (failure.kind === "blocked") kind = "blocked";
		problems.push(failure.detail);
	}
	const install = process.platform === "darwin" ? "`brew install ffmpeg`" : process.platform === "win32" ? "`winget install Gyan.FFmpeg` (then restart Stream Deck)" : "your package manager";
	const hint = ` Install it with ${install}, or set the ffmpeg path on the key.`;
	throw new FfmpegError(`ffmpeg is ${kind === "blocked" ? "present but cannot run" : "not installed or not found"}.${hint} (${problems.join("; ")})`, kind);
}

/** Forgets a remembered ffmpeg location, for example after it was removed. */
export function forgetFfmpeg(): void {
	resolved.clear();
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
		this.emit("status", "connecting");
		this.lastStderr = "";
		findFfmpeg(this.options.ffmpegPath).then(
			(ffmpeg) => {
				if (!this.stopped) this.spawnStream(ffmpeg);
			},
			(err: Error) => {
				if (!this.stopped) this.fail(err.message, "ffmpeg");
			},
		);
	}

	private spawnStream(ffmpeg: string): void {
		const { host, accessCode } = this.options;
		const fps = Math.min(Math.max(this.options.fps ?? 3, 1), 10);

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
			proc = spawn(ffmpeg, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
		} catch (err) {
			forgetFfmpeg();
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
			forgetFfmpeg();
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

	private fail(detail: string, kind: "ffmpeg" | "stream" = "stream"): void {
		this.emit("status", "error", redact(detail.trim(), this.options.accessCode), kind);
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

	const ffmpeg = await findFfmpeg(options.ffmpegPath);
	return new Promise<string>((resolve, reject) => {
		let stderr = "";
		const proc = spawn(ffmpeg, args, { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
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
