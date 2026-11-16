import type { ActiveFilament } from "./types";

/** Index of the first AMS HT unit; regular AMS / AMS Lite units are 0-3. */
export const AMS_HT_FIRST_ID = 128;

/** Short unit name used on the keys: A-D for regular units, HT1, HT2... for AMS HT units. */
export function amsUnitLabel(unitId: number): string {
	if (unitId >= AMS_HT_FIRST_ID) return `HT${unitId - AMS_HT_FIRST_ID + 1}`;
	return String.fromCharCode(65 + Math.max(0, unitId));
}

/**
 * Decodes the per-nozzle `snow` value from device.extruder.info: the high byte is the AMS unit and the low byte the
 * slot. 255 in the unit byte means the first external spool, 254 the second, and 255 in the slot byte means nothing
 * is loaded.
 */
export function decodeNozzleTray(snow: number): ActiveFilament | null {
	const unit = (snow >> 8) & 0xff;
	const slot = snow & 0xff;
	if (unit === 255) return slot === 255 ? null : { kind: "external", index: 0 };
	if (unit === 254) return slot === 255 ? null : { kind: "external", index: 1 };
	if (slot === 255) return null;
	return { kind: "ams", unitId: unit, slot };
}

/**
 * Decodes the legacy single `tray_now` value: 255 = nothing, 254 = external spool, 128 and up = AMS HT unit,
 * otherwise unit * 4 + slot.
 */
export function decodeLegacyTray(trayNow: number): ActiveFilament | null {
	if (!Number.isFinite(trayNow) || trayNow < 0 || trayNow === 255) return null;
	if (trayNow === 254) return { kind: "external", index: 0 };
	if (trayNow >= 80) return { kind: "ams", unitId: trayNow, slot: 0 };
	return { kind: "ams", unitId: trayNow >> 2, slot: trayNow & 0x3 };
}

/** Reads the "AMS unit" key setting (unit id as text); defaults to unit A. */
export function parseUnitSetting(value: unknown): number {
	const id = Number.parseInt(String(value ?? ""), 10);
	return Number.isFinite(id) && id >= 0 ? id : 0;
}

/** Reads the "External spool" key setting (0 or 1); defaults to the first spool. */
export function parseExternalSetting(value: unknown): number {
	return Number.parseInt(String(value ?? ""), 10) === 1 ? 1 : 0;
}
