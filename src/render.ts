// Genera imágenes SVG en formato Data URI para las acciones del Stream Deck.
import type { BambuTelemetry, GcodeState } from "./types";

const SIZE = 144;

const BG = "#15171c";
const RING_TRACK = "#2a2e36";
const TEXT = "#f2f3f5";
const MUTED = "#8a92a1";
export const ERROR_COLOR = "#e0433d";

const STATE_COLOR: Record<GcodeState, string> = {
	RUNNING: "#00ae42",
	PAUSE: "#f2b134",
	PREPARE: "#3aa0ff",
	FINISH: "#00ae42",
	FAILED: "#e0433d",
	IDLE: "#5b6472",
	UNKNOWN: "#5b6472",
	OTHER: "#5b6472",
};

const STATE_LABEL: Record<GcodeState, string> = {
	RUNNING: "PRINTING",
	PAUSE: "PAUSED",
	PREPARE: "PREPARING",
	FINISH: "FINISHED",
	FAILED: "FAILED",
	IDLE: "IDLE",
	UNKNOWN: "NO DATA",
	OTHER: "-",
};

function esc(text: string): string {
	return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function frame(inner: string): string {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}">
		<rect width="${SIZE}" height="${SIZE}" rx="20" fill="${BG}"/>
		${inner}
	</svg>`;
	return `data:image/svg+xml;charset=utf8,${encodeURIComponent(svg)}`;
}

function progressRing(state: GcodeState, progressPercent: number | null, color: string): string {
	const r = 38;
	const cx = 72;
	const cy = 62;
	const circumference = 2 * Math.PI * r;
	const track = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${RING_TRACK}" stroke-width="8"/>`;

	let pct: number | null = null;
	if (state === "RUNNING" || state === "PAUSE" || state === "PREPARE") pct = progressPercent ?? 0;
	else if (state === "FINISH") pct = 100;
	if (pct === null) return track;

	const offset = circumference * (1 - Math.min(100, Math.max(0, pct)) / 100);
	const arc = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="8"
		stroke-linecap="round" stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
		transform="rotate(-90 ${cx} ${cy})"/>`;
	return track + arc;
}

function centerLabel(text: string, y: number, size: number, color: string, weight = "700"): string {
	return `<text x="72" y="${y}" font-family="Arial, sans-serif" font-size="${size}" font-weight="${weight}"
		fill="${color}" text-anchor="middle">${esc(text)}</text>`;
}

function formatHumidity(val: number | null): string {
	if (val === null || val === undefined) return "AMS";
	if (val === 1) return "💧 15%";
	if (val === 2) return "💧 24%";
	if (val === 3) return "💧 40%";
	if (val === 4) return "💧 60%";
	if (val === 5) return "💧 80%";
	return `💧 ${Math.round(val)}%`;
}

// ── Individual Views (English) ──────────────────────────────────────────────

export function renderNozzleTempView(t: BambuTelemetry): string {
	const color = STATE_COLOR[t.gcodeState];
	const current = Math.round(t.nozzleTempC ?? 0);
	const target = Math.round(t.nozzleTargetC ?? 0);

	let statusLabel = `Tgt: ${target}°C`;
	let statusColor = MUTED;
	if (target > 0 && current < target - 2) {
		statusLabel = `🔥 HEATING (${target}°)`;
		statusColor = "#f2b134";
	} else if (target === 0 && current > 45) {
		statusLabel = `❄️ COOLING (${current}°)`;
		statusColor = "#3aa0ff";
	}

	return frame(`
		${centerLabel("NOZZLE", 22, 12, MUTED, "600")}
		<!-- Authentic 3D Printer Hotend Icon -->
		<g fill="${color}">
			<rect x="67" y="30" width="10" height="8" rx="1.5"/>
			<rect x="54" y="38" width="36" height="18" rx="3"/>
			<polygon points="58,56 86,56 75,72 69,72"/>
			<line x1="72" y1="72" x2="72" y2="79" stroke="${color}" stroke-width="3" stroke-linecap="round"/>
		</g>
		${centerLabel(`${current}°C`, 105, 28, TEXT)}
		${centerLabel(statusLabel, 130, 11, statusColor, "600")}
	`);
}

export function renderBedTempView(t: BambuTelemetry): string {
	const color = STATE_COLOR[t.gcodeState];
	const current = Math.round(t.bedTempC ?? 0);
	const target = Math.round(t.bedTargetC ?? 0);

	let statusLabel = `Tgt: ${target}°C`;
	let statusColor = MUTED;
	if (target > 0 && current < target - 2) {
		statusLabel = `🔥 HEATING (${target}°)`;
		statusColor = "#f2b134";
	} else if (target === 0 && current > 35) {
		statusLabel = `❄️ COOLING (${current}°)`;
		statusColor = "#3aa0ff";
	}

	return frame(`
		${centerLabel("HEATBED", 22, 12, MUTED, "600")}
		<rect x="44" y="36" width="56" height="34" rx="4" fill="none" stroke="${color}" stroke-width="4"/>
		<line x1="44" y1="53" x2="100" y2="53" stroke="${color}" stroke-width="3"/>
		<line x1="63" y1="36" x2="63" y2="70" stroke="${color}" stroke-width="3"/>
		<line x1="81" y1="36" x2="81" y2="70" stroke="${color}" stroke-width="3"/>
		${centerLabel(`${current}°C`, 105, 28, TEXT)}
		${centerLabel(statusLabel, 130, 11, statusColor, "600")}
	`);
}

export function renderChamberTempView(t: BambuTelemetry): string {
	const color = STATE_COLOR[t.gcodeState];
	let tempVal: number = 42;
	if (t.chamberTempC !== null && t.chamberTempC !== undefined && t.chamberTempC > 0) {
		tempVal = Math.round(t.chamberTempC);
	} else if (t.bedTempC !== null && t.bedTempC !== undefined && t.bedTempC > 0) {
		tempVal = Math.round(t.bedTempC * 0.7);
	}
	const current = `${tempVal}°C`;
	return frame(`
		${centerLabel("CHAMBER", 22, 12, MUTED, "600")}
		<rect x="42" y="34" width="60" height="42" rx="6" fill="none" stroke="${color}" stroke-width="4"/>
		<path d="M54 55 L72 43 L90 55" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round"/>
		${centerLabel(current, 108, 28, TEXT)}
	`);
}

export function renderProgressView(t: BambuTelemetry): string {
	const color = STATE_COLOR[t.gcodeState];
	const percent = t.gcodeState === "FINISH" ? 100 : (t.progressPercent ?? 0);
	const ring = progressRing(t.gcodeState, percent, color);

	return frame(`
		${centerLabel("PROGRESS", 20, 12, MUTED, "600")}
		${ring}
		${centerLabel(`${percent}%`, 71, 28, TEXT, "800")}
		${centerLabel(STATE_LABEL[t.gcodeState], 126, 12, color, "600")}
	`);
}

export function renderTimeView(t: BambuTelemetry): string {
	const accent = STATE_COLOR[t.gcodeState];
	const remaining = t.printing && t.remainingMinutes !== null ? t.remainingMinutes : null;
	const pct = t.progressPercent ?? 0;

	let elapsedMinutes: number | null = null;
	if (remaining !== null && pct > 0 && pct < 100) {
		elapsedMinutes = Math.round((remaining / (100 - pct)) * pct);
	}

	const remainingText = remaining !== null ? `${remaining}m left` : "-- min";
	const elapsedText = elapsedMinutes !== null ? `${elapsedMinutes}m elap.` : "-- min";
	const layerText = t.printing && t.totalLayers ? `${t.layerNum ?? 0}/${t.totalLayers}` : "--";

	return frame(`
		${centerLabel("TIME", 18, 11, MUTED, "600")}
		${centerLabel(remainingText, 48, 17, TEXT, "700")}
		${centerLabel(elapsedText, 76, 14, MUTED, "600")}
		${centerLabel(`${layerText} LAYER`, 118, 14, accent, "700")}
	`);
}

export function renderAmsView(t: BambuTelemetry): string {
	const ams = t.ams;
	if (!ams || (!ams.units || ams.units.length === 0) && !ams.externalSpool) {
		return frame(`
			${centerLabel("AMS", 22, 12, MUTED, "600")}
			<rect x="42" y="38" width="60" height="40" rx="6" fill="none" stroke="${MUTED}" stroke-width="4"/>
			${centerLabel("No AMS", 108, 16, TEXT)}
		`);
	}

	const unit = ams.units?.[0];
	const humidityText = unit ? formatHumidity(unit.humidityPercent) : "SPOOL";
	const activeIndex = ams.activeTrayIndex ?? -1;

	const slotWidth = 24;
	const slotHeight = 44;
	const startX = 14;
	const gap = 7;
	const y = 38;

	const slotsSvg = [0, 1, 2, 3].map((i) => {
		const x = startX + i * (slotWidth + gap);
		const tray = unit?.trays.find((tr) => tr.index === i);
		const color = tray?.color || "#5b6472";
		const isActive = i === activeIndex;
		const activeBorder = isActive ? `stroke="#00ae42" stroke-width="3"` : `stroke="#3a3d47" stroke-width="1.5"`;
		const activeArrow = isActive ? `<polygon points="${x + 6},90 ${x + 18},90 ${x + 12},84" fill="#00ae42"/>` : "";
		const labelColor = isActive ? "#00ae42" : MUTED;

		return `
			<rect x="${x}" y="${y}" width="${slotWidth}" height="${slotHeight}" rx="4" fill="${color}" ${activeBorder}/>
			${activeArrow}
			<text x="${x + 12}" y="108" font-family="Arial, sans-serif" font-size="11" font-weight="700" fill="${labelColor}" text-anchor="middle">A${i + 1}</text>
		`;
	}).join("");

	let statusText = "AMS Standby";
	if (ams.externalSpoolActive || activeIndex === 254) {
		statusText = `Use: Ext Spool (${ams.externalSpool?.type || "PLA"})`;
	} else if (activeIndex >= 0 && activeIndex < 4 && unit) {
		const activeTray = unit.trays.find((tr) => tr.index === activeIndex);
		statusText = `Use: A${activeIndex + 1} (${activeTray?.type || "PLA"})`;
	}

	return frame(`
		${centerLabel(humidityText, 22, 12, MUTED, "600")}
		${slotsSvg}
		${centerLabel(statusText, 132, 11, TEXT, "600")}
	`);
}

export function renderAmsSlotView(t: BambuTelemetry, slotIndex: number): string {
	const ams = t.ams;
	const unit = ams?.units?.[0];
	const tray = unit?.trays?.find((tr) => tr.index === slotIndex);
	const isActive = ams?.activeTrayIndex === slotIndex;

	const slotName = `AMS A${slotIndex + 1}`;
	const color = tray?.color || "#5b6472";
	const typeName = tray?.present ? (tray.type || "PLA") : "EMPTY";

	const ringColor = isActive ? "#00ae42" : "#3a3d47";
	const statusLabel = isActive ? "IN USE" : (tray?.present ? "LOADED" : "EMPTY");
	const statusColor = isActive ? "#00ae42" : (tray?.present ? TEXT : MUTED);

	return frame(`
		${centerLabel(slotName, 22, 12, MUTED, "600")}
		<circle cx="72" cy="62" r="26" fill="${color}" stroke="${ringColor}" stroke-width="${isActive ? 4 : 2}"/>
		<circle cx="72" cy="62" r="10" fill="${BG}"/>
		${centerLabel(typeName, 106, 14, TEXT, "700")}
		${centerLabel(statusLabel, 126, 11, statusColor, "700")}
	`);
}

export function renderExternalSpoolView(t: BambuTelemetry): string {
	const ams = t.ams;
	const ext = ams?.externalSpool;
	const isActive = ams?.externalSpoolActive || ams?.activeTrayIndex === 254;

	const color = ext?.color || "#5b6472";
	const typeName = ext?.present ? (ext.type || "PLA") : "EMPTY";

	const ringColor = isActive ? "#00ae42" : "#3a3d47";
	const statusLabel = isActive ? "IN USE" : (ext?.present ? "LOADED" : "EMPTY");
	const statusColor = isActive ? "#00ae42" : (ext?.present ? TEXT : MUTED);

	return frame(`
		${centerLabel("EXT SPOOL", 22, 12, MUTED, "600")}
		<circle cx="72" cy="62" r="26" fill="${color}" stroke="${ringColor}" stroke-width="${isActive ? 4 : 2}"/>
		<circle cx="72" cy="62" r="10" fill="${BG}"/>
		${centerLabel(typeName, 106, 14, TEXT, "700")}
		${centerLabel(statusLabel, 126, 11, statusColor, "700")}
	`);
}

export function renderFanControlView(t: BambuTelemetry): string {
	const color = STATE_COLOR[t.gcodeState];
	const part = t.fans?.coolingPercent !== null && t.fans?.coolingPercent !== undefined ? `${t.fans.coolingPercent}%` : "0%";
	const aux = t.fans?.auxPercent !== null && t.fans?.auxPercent !== undefined ? `${t.fans.auxPercent}%` : "0%";
	const chamber = t.fans?.chamberPercent !== null && t.fans?.chamberPercent !== undefined ? `${t.fans.chamberPercent}%` : "0%";

	const isCoolingActive = (t.fans?.coolingPercent ?? 0) > 0 || (t.fans?.auxPercent ?? 0) > 0;
	const thermalMode = isCoolingActive ? "COOLING ❄️" : "IDLE 💤";
	const thermalColor = isCoolingActive ? "#3aa0ff" : MUTED;

	return frame(`
		${centerLabel("AIR & FANS", 20, 11, MUTED, "600")}
		${centerLabel(`Part: ${part} | Aux: ${aux}`, 50, 12, TEXT, "700")}
		${centerLabel(`Chamber Fan: ${chamber}`, 76, 11, MUTED, "600")}
		${centerLabel(thermalMode, 122, 13, thermalColor, "700")}
	`);
}

export function renderSubtaskView(t: BambuTelemetry): string {
	const color = STATE_COLOR[t.gcodeState];
	const rawName = t.subtaskName || "No Print Job";
	const cleanName = rawName.replace(/\.gcode$/i, "").replace(/\.3mf$/i, "");
	const truncated = cleanName.length > 13 ? cleanName.slice(0, 11) + ".." : cleanName;

	let speedLabel = "Standard (100%)";
	if (t.speedLevel === 1) speedLabel = "Silent (50%)";
	else if (t.speedLevel === 2) speedLabel = "Standard (100%)";
	else if (t.speedLevel === 3) speedLabel = "Sport (124%)";
	else if (t.speedLevel === 4) speedLabel = "Ludicrous (166%)";

	return frame(`
		${centerLabel("CURRENT GCODE", 20, 11, MUTED, "600")}
		<rect x="18" y="38" width="108" height="44" rx="6" fill="#23262d" stroke="#3a3d47" stroke-width="1.5"/>
		${centerLabel(truncated, 64, 12, TEXT, "700")}
		${centerLabel(speedLabel, 118, 12, color, "700")}
	`);
}

export function renderPlaceholder(message: string, color: string = MUTED): string {
	const lines = message.split("\n");
	const startY = lines.length > 1 ? 96 : 110;
	const labels = lines.map((line, i) => centerLabel(line, startY + i * 20, 15, TEXT)).join("");
	return frame(`
		<circle cx="72" cy="60" r="6" fill="${color}"/>
		${labels}
	`);
}
