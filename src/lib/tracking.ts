/**
 * Tracking number format helpers — single source of truth.
 *
 * Rules (mode-gated):
 *   Air   → carrier dropdown (AIR_CARRIERS) + "Other" + digit number (no length cap)
 *   Ocean → carrier dropdown (OCEAN_CARRIERS) + "Other" + 3-digit number (exact)
 *   Local → free text (anything, including empty)
 *
 * Stored format: "{PREFIX}-{number}"  (Local stores raw text)
 * "Other" carrier becomes a free-text custom prefix (uppercase + digits + hyphens).
 */
import type { ShippingMode } from "@/data/pipelines";

export const AIR_CARRIERS = ["FEDEX", "DHL", "BA", "VA", "UPS"] as const;
export const OCEAN_CARRIERS = ["LCL", "FCL"] as const;

export type AirCarrier = (typeof AIR_CARRIERS)[number];
export type OceanCarrier = (typeof OCEAN_CARRIERS)[number];

export const carriersFor = (mode: ShippingMode | null | undefined): readonly string[] => {
  if (mode === "Air") return AIR_CARRIERS;
  if (mode === "Ocean") return OCEAN_CARRIERS;
  return [];
};

export interface ParsedTracking {
  prefix: string;   // empty if no parsable prefix
  number: string;   // digits or remainder
}

/** Best-effort parse: split "PREFIX-NUMBER" on first dash, otherwise prefix="" / number=raw. */
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

export interface ValidationResult {
  ok: boolean;
  error?: string;
  /** Final value to persist (string for value, null to clear). undefined when invalid. */
  value?: string | null;
}

export interface ComposeInput {
  mode: ShippingMode | null | undefined;
  /** Selected carrier from the dropdown ("" or "Other" for free-text path). */
  carrier: string;
  /** Custom prefix when carrier === "Other". */
  customPrefix: string;
  /** Number portion (digits only for Air/Ocean). */
  number: string;
  /** Local-mode raw text. */
  localText: string;
}

export const validateAndCompose = (input: ComposeInput): ValidationResult => {
  const { mode, carrier, customPrefix, number, localText } = input;
  if (!mode) return { ok: false, error: "Set Mode first" };

  if (mode === "Local") {
    const t = (localText ?? "").trim();
    return { ok: true, value: t === "" ? null : t };
  }

  const knownCarriers = carriersFor(mode);
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
  if (mode === "Ocean" && digits.length !== 3) {
    return { ok: false, error: "Ocean tracking must be 3 digits" };
  }
  return { ok: true, value: `${prefix}-${digits}` };
};
