/**
 * Deduped quote total for footer summaries.
 *
 * Q Amount (project.value) is a quote-level mirrored field: every project
 * row sharing a quote_number carries the SAME amount by design. A plain
 * sum over rows therefore double-counts quotes that have multiple
 * sub-entries. This helper collapses each quote to a single contribution.
 *
 * Rules:
 * - Rows WITH a quoteNumber: group by quoteNumber and contribute the MAX
 *   value across siblings. Max (not first) because a few legacy rows still
 *   carry 0.00 from before the quote-join adoption fix — the real amount
 *   must win over the stale zero.
 * - Rows WITHOUT a quoteNumber: each contributes its own value individually.
 */
export function dedupedQuoteTotal(
  rows: Array<{ quoteNumber?: string | null; value?: number | null }>,
): number {
  if (!rows || rows.length === 0) return 0;
  const quoteMax = new Map<string, number>();
  let unquotedSum = 0;
  for (const r of rows) {
    const v = r.value ?? 0;
    if (r.quoteNumber) {
      const prev = quoteMax.get(r.quoteNumber);
      if (prev === undefined || v > prev) quoteMax.set(r.quoteNumber, v);
    } else {
      unquotedSum += v;
    }
  }
  let total = unquotedSum;
  for (const v of quoteMax.values()) total += v;
  return total;
}

/**
 * Count of distinct quoteNumbers among the given rows. Rows without a
 * quoteNumber are NOT included.
 */
export function distinctQuoteCount(
  rows: Array<{ quoteNumber?: string | null }>,
): number {
  if (!rows || rows.length === 0) return 0;
  const set = new Set<string>();
  for (const r of rows) {
    if (r.quoteNumber) set.add(r.quoteNumber);
  }
  return set.size;
}
