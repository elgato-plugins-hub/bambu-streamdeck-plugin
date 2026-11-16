import streamDeck from "@elgato/streamdeck";

import type { CloudRegion } from "./types";
import { t } from "./i18n";

const WEB_ORIGIN = "https://bambulab.com";
const CSRF_URL = `${WEB_ORIGIN}/api/csrf`;
const TFA_URL = `${WEB_ORIGIN}/api/sign-in/tfa`;

const BROWSER_HEADERS = {
	Accept: "application/json, text/plain, */*",
	"Accept-Language": "en-US,en;q=0.9",
	"Content-Type": "application/json",
	Origin: WEB_ORIGIN,
	Referer: `${WEB_ORIGIN}/`,
};

const SLICER_HEADERS = {
	"Content-Type": "application/json",
	"User-Agent": "bambu_network_agent/01.09.05.01",
	"X-BBL-Client-Name": "OrcaSlicer",
	"X-BBL-Client-Type": "slicer",
	Accept: "application/json",
	"Accept-Language": "en-US,en;q=0.9",
	"X-BBL-Client-Version": "01.09.05.01",
	"X-BBL-Language": "en-US",
	"X-BBL-OS-Type": "windows",
	"X-BBL-OS-Version": "10.0",
	"X-BBL-Device-ID": "streamdeck-bambu-plugin",
	"X-BBL-Agent-Version": "01.09.05.01",
};

function apiBase(region: CloudRegion): string {
	return region === "cn" ? "https://api.bambulab.cn" : "https://api.bambulab.com";
}

export interface BambuDevice {
	[key: string]: any;
	name?: string;
	dev_product_name?: string;
	dev_id: string;
	online?: boolean;
}

export interface LoginResult {
	[key: string]: any;
	success: boolean;
	token?: string;
	loginType?: "verifyCode" | "tfa" | string;
	tfaKey?: string;
	devices?: BambuDevice[];
	error?: string;
}

function extractToken(data: any): string | null {
	return data?.accessToken ?? data?.data?.accessToken ?? null;
}

function extractSetCookie(res: Response, name: string): string | null {
	const cookies = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
	for (const raw of cookies) {
		const pair = raw.split(";")[0];
		const [cName, cValue] = pair.split("=");
		if (cName === name) return cValue;
	}
	return null;
}

export async function fetchDevices(region: CloudRegion, token: string): Promise<BambuDevice[]> {
	const url = `${apiBase(region)}/v1/iot-service/api/user/bind`;
	const res = await fetch(url, {
		headers: { ...SLICER_HEADERS, Authorization: `Bearer ${token}` },
	});
	const text = await res.text();
	streamDeck.logger.info(`[fetchDevices] region=${region} GET ${url} -> ${res.status}; body=${text.slice(0, 2000)}`);
	if (!res.ok) {
		throw new Error(`Error ${res.status} fetching printers: ${text.slice(0, 200)}`);
	}
	let data: any;
	try {
		data = JSON.parse(text);
	} catch {
		throw new Error(`Non-JSON response fetching printers: ${text.slice(0, 200)}`);
	}
	const rawList = Array.isArray(data.data) ? data.data : Array.isArray(data.devices) ? data.devices : [];
	streamDeck.logger.info(`[fetchDevices] top-level keys=${Object.keys(data).join(",")}; devices in list=${rawList.length}`);
	return rawList.map((d: any) => ({
		name: d.name || d.dev_product_name || t("Bambu Printer"),
		dev_product_name: d.dev_product_name || t("Bambu Printer"),
		dev_id: d.dev_id || d.dev_id_str,
		online: d.online ?? true,
	})).filter((d: BambuDevice) => Boolean(d.dev_id));
}

async function requestEmailCode(region: CloudRegion, email: string): Promise<void> {
	try {
		const res = await fetch(`${apiBase(region)}/v1/user-service/user/sendemail/code`, {
			method: "POST",
			headers: SLICER_HEADERS,
			body: JSON.stringify({ email, type: "codeLogin" }),
		});
		const text = await res.text();
		streamDeck.logger.info(`[requestEmailCode] -> ${res.status}; body=${text.slice(0, 300)}`);
	} catch (e) {
		streamDeck.logger.error(`[requestEmailCode] failed: ${(e as Error).message}`);
	}
}

export async function cloudLogin(region: CloudRegion, account: string, password: string): Promise<LoginResult> {
	try {
		const cleanAccount = account.trim();
		const res = await fetch(`${apiBase(region)}/v1/user-service/user/login`, {
			method: "POST",
			headers: SLICER_HEADERS,
			body: JSON.stringify({ account: cleanAccount, password }),
		});
		const text = await res.text();
		let data: any;
		try {
			data = JSON.parse(text);
		} catch {
			streamDeck.logger.error(`[cloudLogin] login -> ${res.status}; non-JSON body: ${text.slice(0, 300)}`);
			return { success: false, error: t("Login failed (HTTP {0}); the response was not JSON. See the plugin log.", res.status) };
		}
		streamDeck.logger.info(`[cloudLogin] login -> ${res.status}; loginType=${data.loginType ?? "none"}; hasToken=${Boolean(extractToken(data))}; message=${data.message ?? data.error ?? ""}`);

		if (!res.ok && !data.loginType) {
			const errorMsg = data.message || data.error || (res.status === 400 ? t("Incorrect username or password") : t("HTTP error {0}", res.status));
			return { success: false, error: errorMsg };
		}

		const token = extractToken(data);
		if (token) {
			const devices = await fetchDevices(region, token).catch((e) => {
				streamDeck.logger.error(`[cloudLogin] fetchDevices failed: ${(e as Error).message}`);
				return [] as BambuDevice[];
			});
			return { success: true, token, devices, ...(devices.length === 0 ? { deviceError: t("Logged in, but printer list failed or was empty; see plugin log.") } : {}) };
		}

		const loginType = data.loginType;
		if (loginType === "verifyCode" || loginType === "tfa") {
			if (loginType === "verifyCode") {
				await requestEmailCode(region, cleanAccount);
			}
			return {
				success: false,
				loginType,
				tfaKey: data.tfaKey,
				error: loginType === "verifyCode" ? t("A verification code sent by email is required") : t("A TOTP code from your authenticator app is required"),
			};
		}

		return { success: false, error: data.message || t("Could not obtain an access token.") };
	} catch (err) {
		return { success: false, error: (err as Error).message };
	}
}

export async function cloudVerifyCode(region: CloudRegion, account: string, code: string, loginType: string, tfaKey?: string): Promise<LoginResult> {
	try {
		const cleanAccount = account.trim();
		let token: string | null = null;

		if (loginType === "verifyCode") {
			const res = await fetch(`${apiBase(region)}/v1/user-service/user/login`, {
				method: "POST",
				headers: SLICER_HEADERS,
				body: JSON.stringify({ account: cleanAccount, code: code.trim() }),
			});
			const data = (await res.json()) as any;
			token = extractToken(data);
		} else if (loginType === "tfa" && tfaKey) {
			const csrfRes = await fetch(CSRF_URL, { headers: BROWSER_HEADERS });
			const csrfValue = extractSetCookie(csrfRes, "bbl_csrf_token");
			if (!csrfValue) throw new Error(t("Could not obtain the CSRF token"));

			const tfaRes = await fetch(TFA_URL, {
				method: "POST",
				headers: {
					...BROWSER_HEADERS,
					Cookie: `bbl_csrf_token=${csrfValue}`,
					"x-bbl-csrf-token": csrfValue,
				},
				body: JSON.stringify({ tfaKey, tfaCode: code.trim() }),
			});

			const tokenCookie = extractSetCookie(tfaRes, "token");
			if (tokenCookie) {
				token = tokenCookie;
			} else {
				const body = (await tfaRes.json()) as any;
				token = body.accessToken ?? body.token ?? null;
			}
		}

		if (!token) {
			return { success: false, error: t("Verification code is incorrect or has expired.") };
		}

		const devices = await fetchDevices(region, token).catch((e) => {
			streamDeck.logger.error(`[cloudVerifyCode] fetchDevices failed: ${(e as Error).message}`);
			return [] as BambuDevice[];
		});
		return { success: true, token, devices };
	} catch (err) {
		return { success: false, error: (err as Error).message };
	}
}
