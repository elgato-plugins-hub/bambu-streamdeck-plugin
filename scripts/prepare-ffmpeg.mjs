// Optional: bundles an ffmpeg binary into the plugin folder (npm run build:bundled).
//
// The default build does NOT include ffmpeg; users install it themselves. Use this only for builds you want to
// ship with ffmpeg included (for example a private Windows package). It copies the binary installed by the
// `ffmpeg-static` package for the CURRENT platform, so build on each platform you want to ship.
//
//   npm install --no-save ffmpeg-static
//   npm run build:bundled
//
// Note: ffmpeg-static provides GPL builds of ffmpeg; redistributing them carries FFmpeg's license obligations.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const sdPlugin = "com.alejandrocabo.bambuconnect.sdPlugin";

let source = null;
try {
	source = require("ffmpeg-static");
} catch {
	console.error("[prepare-ffmpeg] The `ffmpeg-static` package is not installed. Run `npm install --no-save ffmpeg-static` first.");
	process.exit(1);
}

if (!source || !fs.existsSync(source)) {
	console.error("[prepare-ffmpeg] ffmpeg-static did not provide a binary for this platform.");
	process.exit(1);
}

const target = path.join(sdPlugin, "bin", "ffmpeg", path.basename(source));
fs.mkdirSync(path.dirname(target), { recursive: true });
if (!fs.existsSync(target) || fs.statSync(target).size !== fs.statSync(source).size) {
	fs.copyFileSync(source, target);
	if (process.platform !== "win32") fs.chmodSync(target, 0o755);
	console.log(`[prepare-ffmpeg] copied ${path.basename(source)} to ${target}`);
} else {
	console.log(`[prepare-ffmpeg] ${target} is already up to date`);
}
