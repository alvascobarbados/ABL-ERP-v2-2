/**
 * Compact relative-duration formatter for the "Current Stage" column.
 * Format ladder:
 *   < 1 min   → "just now"
 *   < 1 hour  → "Nm"
 *   < 24h     → "Nh"
 *   < 7 days  → "Nd"
 *   < 30 days → "Nd"
 *   < 1 year  → "Nmo"
 *   ≥ 1 year  → "Ny" or "Ny Nmo"
 * No "in" / "ago" prefix — these are durations, not statements about time.
 */
export function fmtTimeInStage(since: Date | null | undefined, now: Date = new Date()): string {
  if (!since) return "—";
  const ms = now.getTime() - since.getTime();
  if (ms < 0) return "just now";
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  const years = Math.floor(months / 12);
  const remMonths = months - years * 12;
  return remMonths > 0 ? `${years}y ${remMonths}mo` : `${years}y`;
}
