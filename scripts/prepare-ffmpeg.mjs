// Copies the ffmpeg binary installed by `ffmpeg-static` into the plugin folder so the Camera action can use it.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const sdPlugin = "com.alejandrocabo.bambuconnect.sdPlugin";
const source = require("ffmpeg-static");

if (!source || !fs.existsSync(source)) {
	console.warn("[prepare-ffmpeg] ffmpeg-static did not provide a binary for this platform; the Camera action will fall back to ffmpeg on PATH.");
	process.exit(0);
}

const target = path.join(sdPlugin, "bin", "ffmpeg", path.basename(source));
fs.mkdirSync(path.dirname(target), { recursive: true });
if (!fs.existsSync(target) || fs.statSync(target).size !== fs.statSync(source).size) {
	fs.copyFileSync(source, target);
	if (process.platform !== "win32") fs.chmodSync(target, 0o755);
	console.log(`[prepare-ffmpeg] copied ${path.basename(source)} to ${target}`);
}
