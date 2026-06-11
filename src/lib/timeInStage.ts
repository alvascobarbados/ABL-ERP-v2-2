/**
 * Calendar-day formatter for the "Current Stage" column.
 * Output: "Nd" — difference between local calendar dates of `now` and `since`.
 *   Anything entered yesterday shows "1d" today regardless of clock time
 *   (Gmail-style). Em-dash if no timestamp. Future `since` → "0d".
 */
function midnightLocal(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function fmtTimeInStage(since: Date | null | undefined, now: Date = new Date()): string {
  if (!since) return "—";
  const diffMs = midnightLocal(now) - midnightLocal(since);
  if (diffMs <= 0) return "0d";
  const days = Math.round(diffMs / 86_400_000);
  return `${days}d`;
}
