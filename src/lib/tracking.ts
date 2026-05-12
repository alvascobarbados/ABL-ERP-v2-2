/**
 * Tracking + Shipment Number format helpers — single source of truth.
 *
 * Two distinct concepts now live here:
 *
 * SHIPMENT NUMBER (internal, company-assigned)
 *   Air   → AIR-#### (exactly 4 digits)
 *   Ocean → FCL-### or LCL-### (exactly 3 digits)
 *   Local → not supported in v1
 *
 * TRACKING NUMBER (carrier-issued / B/L)
 *   Air   → carrier dropdown (AIR_CARRIERS) + "Other" + digit number (no length cap)
 *   Ocean → BL-{alphanumeric} (single text field, prefix locked, no spaces)
 *   Local → free text (anything, including empty)
 */
import type { ShippingMode } from "@/data/pipelines";

// ─────────── Tracking (carrier / B/L) ───────────

export const AIR_CARRIERS = ["FEDEX", "DHL", "BA", "VA", "UPS"] as const;
/** @deprecated Ocean tracking no longer uses FCL/LCL dropdowns — those moved to ShipmentNumber. Kept for back-compat parsing only. */
export const OCEAN_CARRIERS = ["LCL", "FCL"] as const;
/** B/L prefix locked on Ocean tracking. */
export const OCEAN_TRACKING_PREFIX = "BL";

export type AirCarrier = (typeof AIR_CARRIERS)[number];
export type OceanCarrier = (typeof OCEAN_CARRIERS)[number];

export const carriersFor = (mode: ShippingMode | null | undefined): readonly string[] => {
  if (mode === "Air") return AIR_CARRIERS;
  // Ocean no longer uses a carrier dropdown for tracking — single BL- text field.
  return [];
};

export interface ParsedTracking {
  prefix: string;   // empty if no parsable prefix
  number: string;   // suffix after first dash, or whole raw value
}

/** Best-effort parse: split "PREFIX-SUFFIX" on first dash, otherwise prefix="" / number=raw. */
export const parseTracking = (raw?: string | null): ParsedTracking => {
  if (!raw) return { prefix: "", number: "" };
  const m = raw.match(/^([A-Za-z][A-Za-z0-9]*)-(.*)$/);
  if (m) return { prefix: m[1].toUpperCase(), number: m[2] };
  return { prefix: "", number: raw };
};

export const sanitizeCustomPrefix = (raw: string): string =>
  raw.toUpperCase().replace(/[^A-Z0-9-]/g, "");

export const sanitizeDigits = (raw: string, maxLen?: number): string => {
  const d = (raw ?? "").replace(/\D/g, "");
  return maxLen != null ? d.slice(0, maxLen) : d;
};

/** Uppercase alphanumeric only (B/L numbers, no spaces, no punctuation). */
export const sanitizeAlnum = (raw: string, maxLen?: number): string => {
  const s = (raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return maxLen != null ? s.slice(0, maxLen) : s;
};

export interface ValidationResult {
  ok: boolean;
  error?: string;
  /** Final value to persist (string for value, null to clear). undefined when invalid. */
  value?: string | null;
}

export interface ComposeInput {
  mode: ShippingMode | null | undefined;
  /** Selected carrier from the dropdown (Air only; "" or "Other" for free-text path). */
  carrier: string;
  /** Custom prefix when carrier === "Other" (Air only). */
  customPrefix: string;
  /** Number portion (digits for Air carrier path). */
  number: string;
  /** Local-mode raw text. */
  localText: string;
  /** Ocean B/L suffix (alphanumeric, no spaces). Stored as "BL-{suffix}". */
  oceanBlSuffix?: string;
}

/**
 * Compose + validate a TRACKING NUMBER (carrier-issued / B/L) for the given mode.
 *
 *   Air   → {carrier}-{digits}   (carrier from AIR_CARRIERS or "Other"+customPrefix)
 *   Ocean → BL-{alphanumeric}    (single text, prefix locked)
 *   Local → free text            (empty → null)
 */
export const validateAndCompose = (input: ComposeInput): ValidationResult => {
  const { mode, carrier, customPrefix, number, localText, oceanBlSuffix } = input;
  if (!mode) return { ok: false, error: "Set Mode first" };

  if (mode === "Local") {
    const t = (localText ?? "").trim();
    return { ok: true, value: t === "" ? null : t };
  }

  if (mode === "Ocean") {
    const suffix = sanitizeAlnum(oceanBlSuffix ?? "");
    if (!suffix) return { ok: false, error: "B/L number required" };
    return { ok: true, value: `${OCEAN_TRACKING_PREFIX}-${suffix}` };
  }

  // Air
  const knownCarriers = AIR_CARRIERS;
  const isOther = carrier === "Other";
  const prefix = isOther ? sanitizeCustomPrefix(customPrefix).replace(/-+$/, "") : carrier;

  if (!prefix) {
    return { ok: false, error: isOther ? "Carrier code required" : "Select a carrier" };
  }
  if (!isOther && !knownCarriers.includes(prefix as any)) {
    return { ok: false, error: "Select a carrier" };
  }

  const digits = sanitizeDigits(number);
  if (!digits) return { ok: false, error: "Tracking number required" };
  return { ok: true, value: `${prefix}-${digits}` };
};

/** Stand-alone tracking validator for a stored value (used outside the editor). */
export const validateTracking = (
  mode: ShippingMode | null | undefined,
  value: string | null | undefined,
): ValidationResult => {
  if (!mode) return { ok: false, error: "Set Mode first" };
  const v = (value ?? "").trim();
  if (mode === "Local") return { ok: true, value: v === "" ? null : v };
  if (v === "") return { ok: true, value: null };
  if (mode === "Ocean") {
    if (!/^BL-[A-Z0-9]+$/.test(v)) return { ok: false, error: "Ocean tracking must be BL- followed by alphanumeric" };
    return { ok: true, value: v };
  }
  // Air
  if (!/^[A-Z][A-Z0-9-]*-\d+$/.test(v)) return { ok: false, error: "Air tracking must be CARRIER-digits" };
  return { ok: true, value: v };
};

// ─────────── Shipment Number (internal, company-assigned) ───────────

export const SHIPMENT_AIR_PREFIX = "AIR" as const;
export const SHIPMENT_OCEAN_PREFIXES = ["FCL", "LCL"] as const;
export type ShipmentOceanPrefix = (typeof SHIPMENT_OCEAN_PREFIXES)[number];

export interface ParsedShipmentNumber {
  prefix: string;
  number: string;
}

/** Parse a stored shipment number "PREFIX-NNN" → { prefix, number }, else null. */
export const parseShipmentNumber = (raw?: string | null): ParsedShipmentNumber | null => {
  if (!raw) return null;
  const m = raw.trim().toUpperCase().match(/^(AIR|FCL|LCL)-(\d+)$/);
  if (!m) return null;
  return { prefix: m[1], number: m[2] };
};

export const formatShipmentNumber = (prefix: string, number: string): string =>
  `${prefix.toUpperCase()}-${number}`;

/** Validate a complete shipment number string for the given mode. */
export const validateShipmentNumber = (
  mode: ShippingMode | null | undefined,
  value: string | null | undefined,
): ValidationResult => {
  if (!mode) return { ok: false, error: "Set Mode first" };
  if (mode === "Local") return { ok: false, error: "Shipment Number not supported for Local mode" };
  const v = (value ?? "").trim().toUpperCase();
  if (v === "") return { ok: true, value: null };
  if (mode === "Air") {
    if (!/^AIR-\d{4}$/.test(v)) return { ok: false, error: "Air shipment number must be AIR-#### (4 digits)" };
    return { ok: true, value: v };
  }
  if (mode === "Ocean") {
    if (!/^(FCL|LCL)-\d{3}$/.test(v)) return { ok: false, error: "Ocean shipment number must be FCL-### or LCL-### (3 digits)" };
    return { ok: true, value: v };
  }
  return { ok: false, error: "Unsupported mode" };
};
