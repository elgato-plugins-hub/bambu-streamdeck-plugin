export type CloudRegion = 'us' | 'cn';

export interface BambuCloudServiceOptions {
  /** Access token (JWT) de la cuenta Bambu Cloud. Se usa como password MQTT. */
  userToken: string;
  /** Numero de serie del dispositivo, p.ej. "22E...". */
  deviceSerial: string;
  /** Region de la cuenta. Bambu solo tiene brokers "us" y "cn" (EU usa "us"). Default: "us". */
  region?: CloudRegion;
  /** "u_<uid>" ya conocido. Si se omite, se deriva del propio userToken (JWT). */
  userId?: string;
  /** Verificar el certificado TLS del broker. Default: true. */
  rejectUnauthorized?: boolean;
  /** Pedir un "pushall" (snapshot completo) justo tras suscribirse. Default: true. */
  pushAllOnConnect?: boolean;
  debug?: boolean;
}

export type GcodeState =
  | 'UNKNOWN' | 'IDLE' | 'RUNNING' | 'PAUSE' | 'PREPARE' | 'FINISH' | 'FAILED' | 'OTHER';

export interface AmsTray {
  index: number;
  present: boolean;
  type: string | null;
  color: string | null;
  remainPercent: number | null;
}

export interface AmsUnit {
  id: number;
  humidityPercent: number | null;
  tempC: number | null;
  trays: AmsTray[];
}

export interface ExternalSpool {
  present: boolean;
  type: string | null;
  color: string | null;
}

export interface AmsState {
  present: boolean;
  units: AmsUnit[];
  /** Indice de bandeja activa (unitIndex * traysPerUnit + trayId), null si no hay ninguna. */
  activeTrayIndex: number | null;
  externalSpoolActive: boolean;
  externalSpool: ExternalSpool | null;
}

export interface FanState {
  coolingPercent: number | null;
  auxPercent: number | null;
  chamberPercent: number | null;
  heatbreakPercent: number | null;
}

export interface BambuTelemetry {
  timestamp: number;
  deviceSerial: string;
  gcodeState: GcodeState;
  printing: boolean;
  progressPercent: number | null;
  remainingMinutes: number | null;
  layerNum: number | null;
  totalLayers: number | null;
  subtaskName: string | null;
  nozzleTempC: number | null;
  nozzleTargetC: number | null;
  bedTempC: number | null;
  bedTargetC: number | null;
  chamberTempC: number | null;
  speedLevel: number | null;
  wifiSignalDbm: number | null;
  fans: FanState;
  lightOn: boolean | null;
  ams: AmsState | null;
  /** Mensaje JSON completo tal cual llego, por si se necesita algun campo no mapeado. */
  raw: unknown;
}
