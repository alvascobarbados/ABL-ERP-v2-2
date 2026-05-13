/**
 * Money formatting helpers.
 *
 * - formatAmountRounded: whole-number rounded ($5,067) — for dense surfaces
 *   like the pipeline table and totals rows.
 * - formatAmountFull: full 2-decimal precision ($5,066.65) — for detail
 *   pages and anywhere precision matters.
 *
 * Both return "—" for undefined/null. Zero renders as "$0" / "$0.00".
 * No currency suffix is appended; callers add " BBD" when they want it.
 */
export function formatAmountRounded(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `$${Math.round(v).toLocaleString()}`;
}

export function formatAmountFull(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
