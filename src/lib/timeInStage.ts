/**
 * Day-count formatter for the "Current Stage" column.
 * Output: "Nd" (floor of elapsed days). Em-dash if no timestamp.
 *   Today → "0d", 24h+ → "1d", 18 days → "18d", 1 year → "365d".
 */
export function fmtTimeInStage(since: Date | null | undefined, now: Date = new Date()): string {
  if (!since) return "—";
  const ms = now.getTime() - since.getTime();
  if (ms < 0) return "0d";
  const days = Math.floor(ms / 86_400_000);
  return `${days}d`;
}
