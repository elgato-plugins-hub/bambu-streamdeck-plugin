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
  /** 0-3 for regular AMS / AMS Lite units, 128 and up for AMS HT units. */
  id: number;
  humidityPercent: number | null;
  tempC: number | null;
  trays: AmsTray[];
  /** Nozzle this unit feeds on dual-nozzle printers; null when unknown or not applicable. */
  nozzle: NozzleSide | null;
}

export interface ExternalSpool {
  present: boolean;
  type: string | null;
  color: string | null;
}

/** The filament currently feeding the active nozzle: a slot of an AMS unit, or an external spool. */
export type ActiveFilament =
  | { kind: 'ams'; unitId: number; slot: number }
  | { kind: 'external'; index: number };

export interface AmsState {
  present: boolean;
  units: AmsUnit[];
  /** Filament in use right now, or null when nothing is loaded. */
  active: ActiveFilament | null;
  /** External spool holders: index 0 is the first (single-spool printers only have this one), index 1 the second. */
  externalSpools: Array<ExternalSpool | null>;
}

export interface FanState {
  coolingPercent: number | null;
  auxPercent: number | null;
  chamberPercent: number | null;
  heatbreakPercent: number | null;
}

export type NozzleSide = 'left' | 'right';

export interface NozzleReading {
  tempC: number | null;
  targetC: number | null;
}

/** Per-nozzle state reported by printers with more than one nozzle (H2D, X2D...). */
export interface NozzleState {
  dual: boolean;
  /** The nozzle currently in use, or null when unknown (for example while switching). */
  active: NozzleSide | null;
  left: NozzleReading;
  right: NozzleReading;
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
  /** Per-nozzle readings; null until the printer reports them. nozzleTempC/nozzleTargetC always mirror the active nozzle. */
  nozzles: NozzleState | null;
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
