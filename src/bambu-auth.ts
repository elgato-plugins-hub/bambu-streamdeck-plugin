import type { CloudRegion } from "./types";

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
	const res = await fetch(`${apiBase(region)}/v1/iot-service/api/user/bind`, {
		headers: { ...SLICER_HEADERS, Authorization: `Bearer ${token}` },
	});
	if (!res.ok) {
		throw new Error(`Error ${res.status} al obtener las impresoras.`);
	}
	const data = (await res.json()) as any;
	const rawList = Array.isArray(data.data) ? data.data : Array.isArray(data.devices) ? data.devices : [];
	return rawList.map((d: any) => ({
		name: d.name || d.dev_product_name || "Impresora Bambu",
		dev_product_name: d.dev_product_name || "Bambu Printer",
		dev_id: d.dev_id || d.dev_id_str,
		online: d.online ?? true,
	})).filter((d: BambuDevice) => Boolean(d.dev_id));
}

export async function cloudLogin(region: CloudRegion, account: string, password: string): Promise<LoginResult> {
	try {
		const cleanAccount = account.trim();
		const res = await fetch(`${apiBase(region)}/v1/user-service/user/login`, {
			method: "POST",
			headers: SLICER_HEADERS,
			body: JSON.stringify({ account: cleanAccount, password }),
		});
		const data = (await res.json()) as any;

		if (!res.ok && !data.loginType) {
			const errorMsg = data.message || data.error || (res.status === 400 ? "Usuario o contraseña incorrectos" : `Error HTTP ${res.status}`);
			return { success: false, error: errorMsg };
		}

		const token = extractToken(data);
		if (token) {
			const devices = await fetchDevices(region, token).catch(() => []);
			return { success: true, token, devices };
		}

		const loginType = data.loginType;
		if (loginType === "verifyCode" || loginType === "tfa") {
			return {
				success: false,
				loginType,
				tfaKey: data.tfaKey,
				error: loginType === "verifyCode" ? "Se requiere código enviado por email" : "Se requiere código TOTP (App)",
			};
		}

		return { success: false, error: data.message || "No se pudo obtener el token de acceso." };
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
			if (!csrfValue) throw new Error("No se pudo obtener el token CSRF");

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
			return { success: false, error: "Código de verificación incorrecto o expirado." };
		}

		const devices = await fetchDevices(region, token).catch(() => []);
		return { success: true, token, devices };
	} catch (err) {
		return { success: false, error: (err as Error).message };
	}
}
