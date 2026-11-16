// Generates SVG data-URI images for the Stream Deck actions.
import type { BambuTelemetry, GcodeState } from "./types";
import { AMS_HT_FIRST_ID, amsUnitLabel } from "./ams";

const SIZE = 144;

const BG = "#111318";
const RING_TRACK = "#262a33";
const TEXT = "#ffffff";
const MUTED = "#a0a7b5";
export const ERROR_COLOR = "#ff4d4d";

const STATE_COLOR: Record<GcodeState, string> = {
	RUNNING: "#00e65c",
	PAUSE: "#ffbe3b",
	PREPARE: "#3ba3ff",
	FINISH: "#00e65c",
	FAILED: "#ff4d4d",
	IDLE: "#788294",
	UNKNOWN: "#788294",
	OTHER: "#788294",
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
		<rect width="${SIZE}" height="${SIZE}" rx="18" fill="${BG}"/>
		${inner}
	</svg>`;
	return `data:image/svg+xml;charset=utf8,${encodeURIComponent(svg)}`;
}

function progressRing(state: GcodeState, progressPercent: number | null, color: string): string {
	const r = 40;
	const cx = 72;
	const cy = 64;
	const circumference = 2 * Math.PI * r;
	const track = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${RING_TRACK}" stroke-width="10"/>`;

	let pct: number | null = null;
	if (state === "RUNNING" || state === "PAUSE" || state === "PREPARE") pct = progressPercent ?? 0;
	else if (state === "FINISH") pct = 100;
	if (pct === null) return track;

	const offset = circumference * (1 - Math.min(100, Math.max(0, pct)) / 100);
	const arc = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="10"
		stroke-linecap="round" stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
		transform="rotate(-90 ${cx} ${cy})"/>`;
	return track + arc;
}

function centerLabel(text: string, y: number, size: number, color: string, weight = "800"): string {
	return `<text x="72" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${weight}"
		fill="${color}" text-anchor="middle">${esc(text)}</text>`;
}

function formatDuration(totalMinutes: number | null): string {
	if (totalMinutes === null || totalMinutes === undefined || totalMinutes < 0) return "--";
	const days = Math.floor(totalMinutes / 1440);
	const hours = Math.floor((totalMinutes % 1440) / 60);
	const mins = Math.round(totalMinutes % 60);

	if (days > 0) return `${days}d ${hours}h ${mins}m`;
	if (hours > 0) return `${hours}h ${mins}m`;
	return `${mins}m`;
}

function formatHumidity(val: number | null, tempC?: number | null): string {
	if (val === null || val === undefined) return "AMS";
	let pctStr = "";
	if (val === 1) pctStr = "💧 10%";
	else if (val === 2) pctStr = "💧 18%";
	else if (val === 3) pctStr = "💧 25%";
	else if (val === 4) pctStr = "💧 45%";
	else if (val === 5) pctStr = "💧 70%";
	else pctStr = `💧 ${Math.round(val)}%`;

	if (tempC !== null && tempC !== undefined && tempC > 0) {
		return `${pctStr} | ${Math.round(tempC)}°C`;
	}
	return pctStr;
}

// ── Individual Views (Big & Bold for Stream Deck Display) ───────────────────

function textAt(x: number, y: number, text: string, size: number, color: string, weight = "800"): string {
	return `<text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${weight}"
		fill="${color}" text-anchor="middle">${esc(text)}</text>`;
}

/** Two-panel view for dual-nozzle printers: left nozzle on the left, right nozzle on the right, active one outlined. */
function renderDualNozzleView(t: BambuTelemetry): string {
	const nozzles = t.nozzles!;
	const accent = STATE_COLOR[t.gcodeState];

	const panel = (side: "left" | "right", x: number): string => {
		const reading = nozzles[side];
		const isActive = nozzles.active === side;
		const current = Math.round(reading.tempC ?? 0);
		const target = Math.round(reading.targetC ?? 0);

		let targetLabel = "OFF";
		let targetColor = MUTED;
		if (target > 0) {
			targetLabel = `→${target}°`;
			targetColor = current < target - 2 ? "#ffbe3b" : "#00e65c";
		} else if (current > 45) {
			targetLabel = "COOL";
			targetColor = "#3ba3ff";
		}

		const border = isActive ? `stroke="${accent}" stroke-width="4"` : `stroke="#383d47" stroke-width="2"`;
		const cx = x + 30;
		return `
			<rect x="${x}" y="32" width="60" height="100" rx="10" fill="none" ${border}/>
			${textAt(cx, 56, side === "left" ? "L" : "R", 18, isActive ? TEXT : MUTED, "900")}
			${textAt(cx, 93, `${current}°`, 25, TEXT, "900")}
			${textAt(cx, 118, targetLabel, 14, targetColor, "800")}
		`;
	};

	return frame(`
		${centerLabel("NOZZLES", 22, 15, MUTED, "800")}
		${panel("left", 8)}
		${panel("right", 76)}
	`);
}

export function renderNozzleTempView(t: BambuTelemetry): string {
	if (t.nozzles?.dual) return renderDualNozzleView(t);
	const color = STATE_COLOR[t.gcodeState];
	const current = Math.round(t.nozzleTempC ?? 0);
	const target = Math.round(t.nozzleTargetC ?? 0);

	let statusLabel = `Tgt: ${target}°C`;
	let statusColor = MUTED;
	if (target > 0 && current < target - 2) {
		statusLabel = `🔥 HEAT ${target}°`;
		statusColor = "#ffbe3b";
	} else if (target === 0 && current > 45) {
		statusLabel = `❄️ COOL ${current}°`;
		statusColor = "#3ba3ff";
	}

	return frame(`
		${centerLabel("NOZZLE", 25, 16, MUTED, "800")}
		<!-- Clean Hotend Icon -->
		<g fill="${color}">
			<rect x="65" y="32" width="14" height="10" rx="2"/>
			<polygon points="54,42 90,42 78,58 66,58"/>
			<line x1="72" y1="58" x2="72" y2="66" stroke="${color}" stroke-width="4" stroke-linecap="round"/>
		</g>
		${centerLabel(`${current}°C`, 104, 34, TEXT, "900")}
		${centerLabel(statusLabel, 131, 15, statusColor, "800")}
	`);
}

export function renderBedTempView(t: BambuTelemetry): string {
	const color = STATE_COLOR[t.gcodeState];
	const current = Math.round(t.bedTempC ?? 0);
	const target = Math.round(t.bedTargetC ?? 0);

	let statusLabel = `Tgt: ${target}°C`;
	let statusColor = MUTED;
	if (target > 0 && current < target - 2) {
		statusLabel = `🔥 HEAT ${target}°`;
		statusColor = "#ffbe3b";
	} else if (target === 0 && current > 35) {
		statusLabel = `❄️ COOL ${current}°`;
		statusColor = "#3ba3ff";
	}

	return frame(`
		${centerLabel("HEATBED", 25, 16, MUTED, "800")}
		<rect x="42" y="34" width="60" height="34" rx="5" fill="none" stroke="${color}" stroke-width="4.5"/>
		<line x1="42" y1="51" x2="102" y2="51" stroke="${color}" stroke-width="3"/>
		<line x1="62" y1="34" x2="62" y2="68" stroke="${color}" stroke-width="3"/>
		<line x1="82" y1="34" x2="82" y2="68" stroke="${color}" stroke-width="3"/>
		${centerLabel(`${current}°C`, 104, 34, TEXT, "900")}
		${centerLabel(statusLabel, 131, 15, statusColor, "800")}
	`);
}

export function renderChamberTempView(t: BambuTelemetry): string {
	const color = STATE_COLOR[t.gcodeState];
	const tempVal = t.chamberTempC !== null && t.chamberTempC !== undefined && t.chamberTempC > 0 ? Math.round(t.chamberTempC) : null;
	const tempText = tempVal !== null ? `${tempVal}°C` : "--°C";

	return frame(`
		${centerLabel("CHAMBER", 25, 16, MUTED, "800")}
		<rect x="40" y="36" width="64" height="42" rx="7" fill="none" stroke="${color}" stroke-width="4.5"/>
		<path d="M52 57 L72 44 L92 57" fill="none" stroke="${color}" stroke-width="3.5" stroke-linecap="round"/>
		${centerLabel(tempText, 116, 36, TEXT, "900")}
	`);
}

export function renderProgressView(t: BambuTelemetry): string {
	const color = STATE_COLOR[t.gcodeState];
	const percent = t.gcodeState === "FINISH" ? 100 : (t.progressPercent ?? 0);
	const ring = progressRing(t.gcodeState, percent, color);

	return frame(`
		${centerLabel("PROGRESS", 23, 15, MUTED, "800")}
		${ring}
		${centerLabel(`${percent}%`, 73, 32, TEXT, "900")}
		${centerLabel(STATE_LABEL[t.gcodeState], 130, 15, color, "800")}
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

	const hasDays = remaining !== null && remaining >= 1440;
	const remainingText = remaining !== null ? (hasDays ? `${formatDuration(remaining)}` : `${formatDuration(remaining)} left`) : "-- left";
	const elapsedText = elapsedMinutes !== null ? `${formatDuration(elapsedMinutes)} elap` : "-- elap";
	const layerText = t.printing && t.totalLayers ? `L ${t.layerNum ?? 0} / ${t.totalLayers}` : "-- LAYER";

	const remainingSize = hasDays ? 17 : 20;

	return frame(`
		${centerLabel("TIME", 24, 15, MUTED, "800")}
		${centerLabel(remainingText, 56, remainingSize, TEXT, "900")}
		${centerLabel(elapsedText, 86, 15, MUTED, "700")}
		${centerLabel(layerText, 126, 16, accent, "800")}
	`);
}

/** "A1", "B3"... for regular units; just "HT1" for AMS HT units, which have a single slot. */
function slotName(unitId: number, slot: number): string {
	return unitId >= AMS_HT_FIRST_ID ? amsUnitLabel(unitId) : `${amsUnitLabel(unitId)}${slot + 1}`;
}

/** Filament currently in use, as short text for the overview key. */
function activeFilamentText(ams: NonNullable<BambuTelemetry["ams"]>): string {
	const active = ams.active;
	if (!active) return "AMS Standby";
	if (active.kind === "external") {
		const spool = ams.externalSpools[active.index];
		const hasTwo = ams.externalSpools[1] !== undefined && ams.externalSpools[1] !== null;
		return hasTwo || active.index > 0 ? `EXT ${active.index + 1}: ${spool?.type || "PLA"}` : `EXT SPOOL (${spool?.type || "PLA"})`;
	}
	const unit = ams.units.find((u) => u.id === active.unitId);
	const tray = unit?.trays.find((tr) => tr.index === active.slot);
	return `${slotName(active.unitId, active.slot)}: ${tray?.type || "PLA"}`;
}

/** AMS overview: one unit at a time (the key cycles through units when pressed). */
export function renderAmsView(t: BambuTelemetry, unitIndex = 0): string {
	const ams = t.ams;
	const hasExternal = !!ams?.externalSpools?.some((spool) => spool);
	if (!ams || (ams.units.length === 0 && !hasExternal)) {
		return frame(`
			${centerLabel("AMS", 25, 16, MUTED, "800")}
			<rect x="40" y="38" width="64" height="40" rx="6" fill="none" stroke="${MUTED}" stroke-width="4"/>
			${centerLabel("No AMS", 112, 18, TEXT, "800")}
		`);
	}

	const count = ams.units.length;
	const unit = count > 0 ? ams.units[((unitIndex % count) + count) % count] : undefined;
	const isHt = !!unit && unit.id >= AMS_HT_FIRST_ID;
	const prefix = unit ? amsUnitLabel(unit.id) : "";
	const humidity = unit ? formatHumidity(unit.humidityPercent, unit.tempC) : "SPOOL";
	const header = unit && (count > 1 || isHt) ? `${prefix} \u00b7 ${humidity}` : humidity;
	const nozzleTag = unit?.nozzle && t.nozzles?.dual ? textAt(132, 11, unit.nozzle === "left" ? "L" : "R", 11, "#3ba3ff", "900") : "";

	const slotWidth = 25;
	const slotHeight = 46;
	const gap = 7;
	const y = 36;
	const slotCount = isHt ? 1 : 4;
	const startX = (144 - (slotCount * slotWidth + (slotCount - 1) * gap)) / 2;

	const slotsSvg = Array.from({ length: slotCount }, (_, i) => {
		const x = startX + i * (slotWidth + gap);
		const tray = unit?.trays.find((tr) => tr.index === i);
		const color = tray?.color || "#5b6472";
		const isActive = !!unit && ams.active?.kind === "ams" && ams.active.unitId === unit.id && ams.active.slot === i;
		const activeBorder = isActive ? `stroke="#00e65c" stroke-width="3.5"` : `stroke="#383d47" stroke-width="2"`;
		const activeArrow = isActive ? `<polygon points="${x + 6},92 ${x + 19},92 ${x + 12.5},85" fill="#00e65c"/>` : "";
		const labelColor = isActive ? "#00e65c" : MUTED;
		const label = isHt ? prefix : `${prefix || "A"}${i + 1}`;

		return `
			<rect x="${x}" y="${y}" width="${slotWidth}" height="${slotHeight}" rx="5" fill="${color}" ${activeBorder}/>
			${activeArrow}
			<text x="${x + 12.5}" y="110" font-family="Arial, sans-serif" font-size="14" font-weight="800" fill="${labelColor}" text-anchor="middle">${esc(label)}</text>
		`;
	}).join("");

	return frame(`
		${centerLabel(header, 27, 14, MUTED, "800")}
		${nozzleTag}
		${slotsSvg}
		${centerLabel(activeFilamentText(ams), 132, 14, TEXT, "800")}
	`);
}

export function renderAmsSlotView(t: BambuTelemetry, slotIndex: number, unitId = 0): string {
	const ams = t.ams;
	const unit = ams?.units?.find((u) => u.id === unitId);
	const tray = unit?.trays?.find((tr) => tr.index === slotIndex);
	const isActive = ams?.active?.kind === "ams" && ams.active.unitId === unitId && ams.active.slot === slotIndex;
	const noUnit = !!ams && ams.units.length > 0 && !unit;
	const noSlot = !!unit && unit.trays.length > 0 && slotIndex >= unit.trays.length;

	const title = `AMS ${slotName(unitId, slotIndex)}`;
	const color = tray?.color || "#5b6472";
	const typeName = noUnit ? "--" : noSlot ? "--" : tray?.present ? (tray.type || "PLA") : "EMPTY";

	const ringColor = isActive ? "#00e65c" : "#383d47";
	const statusLabel = noUnit ? "NO UNIT" : noSlot ? "NO SLOT" : isActive ? "IN USE" : (tray?.present ? "LOADED" : "EMPTY");
	const statusColor = isActive ? "#00e65c" : (tray?.present ? TEXT : MUTED);

	return frame(`
		${centerLabel(title, 25, 16, MUTED, "800")}
		<circle cx="72" cy="64" r="28" fill="${color}" stroke="${ringColor}" stroke-width="${isActive ? 5 : 2.5}"/>
		<circle cx="72" cy="64" r="11" fill="${BG}"/>
		${centerLabel(typeName, 110, 17, TEXT, "800")}
		${centerLabel(statusLabel, 131, 14, statusColor, "800")}
	`);
}

export function renderExternalSpoolView(t: BambuTelemetry, spoolIndex = 0): string {
	const ams = t.ams;
	const ext = ams?.externalSpools?.[spoolIndex];
	const isActive = ams?.active?.kind === "external" && ams.active.index === spoolIndex;
	const hasTwo = !!ams?.externalSpools?.[1] || !!t.nozzles?.dual || spoolIndex > 0;

	const color = ext?.color || "#5b6472";
	const typeName = ext?.present ? (ext.type || "PLA") : "EMPTY";

	const ringColor = isActive ? "#00e65c" : "#383d47";
	const statusLabel = isActive ? "IN USE" : (ext?.present ? "LOADED" : "EMPTY");
	const statusColor = isActive ? "#00e65c" : (ext?.present ? TEXT : MUTED);

	return frame(`
		${centerLabel(hasTwo ? `EXT SPOOL ${spoolIndex + 1}` : "EXT SPOOL", 25, 16, MUTED, "800")}
		<circle cx="72" cy="64" r="28" fill="${color}" stroke="${ringColor}" stroke-width="${isActive ? 5 : 2.5}"/>
		<circle cx="72" cy="64" r="11" fill="${BG}"/>
		${centerLabel(typeName, 110, 17, TEXT, "800")}
		${centerLabel(statusLabel, 131, 14, statusColor, "800")}
	`);
}

export function renderFanControlView(t: BambuTelemetry): string {
	const partVal = t.fans?.coolingPercent;
	const auxVal = t.fans?.auxPercent;
	const chamberVal = t.fans?.chamberPercent;
	const heatbreakVal = t.fans?.heatbreakPercent;

	const partStr = partVal !== null && partVal !== undefined ? `${partVal}%` : "OFF";
	const auxStr = auxVal !== null && auxVal !== undefined ? `${auxVal}%` : "OFF";
	const chamberStr = chamberVal !== null && chamberVal !== undefined ? `${chamberVal}%` : "OFF";
	const heatbreakStr = heatbreakVal !== null && heatbreakVal !== undefined ? `${heatbreakVal}%` : "OFF";

	return frame(`
		${centerLabel("FANS & AIR", 22, 14, MUTED, "800")}
		${centerLabel(`PART: ${partStr}`, 48, 16, TEXT, "900")}
		${centerLabel(`AUX: ${auxStr}`, 70, 16, TEXT, "900")}
		${centerLabel(`ROOM: ${chamberStr}`, 92, 16, TEXT, "900")}
		${centerLabel(`HOTEND: ${heatbreakStr}`, 118, 15, MUTED, "800")}
	`);
}

export function renderSubtaskView(t: BambuTelemetry): string {
	const color = STATE_COLOR[t.gcodeState];
	const rawName = t.subtaskName || "No Job";
	const cleanName = rawName.replace(/\.gcode$/i, "").replace(/\.3mf$/i, "");
	const truncated = cleanName.length > 10 ? cleanName.slice(0, 8) + ".." : cleanName;

	let speedLabel = "STD 100%";
	if (t.speedLevel === 1) speedLabel = "SILENT 50%";
	else if (t.speedLevel === 2) speedLabel = "STD 100%";
	else if (t.speedLevel === 3) speedLabel = "SPORT 124%";
	else if (t.speedLevel === 4) speedLabel = "LUDICROUS";

	return frame(`
		${centerLabel("JOB INFO", 24, 15, MUTED, "800")}
		<rect x="12" y="36" width="120" height="48" rx="8" fill="#1d212a" stroke="#383d47" stroke-width="2"/>
		${centerLabel(truncated, 67, 18, TEXT, "900")}
		${centerLabel(speedLabel, 126, 16, color, "900")}
	`);
}

export function renderLightView(t: BambuTelemetry): string {
	const on = t.lightOn === true;
	const known = t.lightOn !== null && t.lightOn !== undefined;
	const bulb = on ? "#ffd23b" : "#5b6472";
	const rays = on
		? `<g stroke="#ffd23b" stroke-width="4" stroke-linecap="round">
			<line x1="72" y1="26" x2="72" y2="34"/><line x1="40" y1="42" x2="46" y2="48"/><line x1="104" y1="42" x2="98" y2="48"/>
			<line x1="32" y1="66" x2="40" y2="66"/><line x1="112" y1="66" x2="104" y2="66"/></g>`
		: "";
	const label = known ? (on ? "ON" : "OFF") : "--";
	return frame(`
		${centerLabel("LIGHT", 22, 16, MUTED, "800")}
		${rays}
		<circle cx="72" cy="64" r="22" fill="${on ? bulb : "none"}" stroke="${bulb}" stroke-width="4.5"/>
		<rect x="62" y="86" width="20" height="9" rx="3" fill="none" stroke="${bulb}" stroke-width="3.5"/>
		${centerLabel(label, 128, 30, on ? "#ffd23b" : TEXT, "900")}
	`);
}

export function renderPlaceholder(message: string, color: string = MUTED): string {
	const lines = message.split("\n");
	const startY = lines.length > 1 ? 90 : 105;
	const labels = lines.map((line, i) => centerLabel(line, startY + i * 22, 17, TEXT, "800")).join("");
	return frame(`
		<circle cx="72" cy="54" r="8" fill="${color}"/>
		${labels}
	`);
}
