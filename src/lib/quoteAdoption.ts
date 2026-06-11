/**
 * Quote-join field adoption (pure logic).
 *
 * Sister to `mirrorToSiblings` in usePipelineStore.tsx.
 *
 * Background: when a project's `quoteNumber` is SET or CHANGED to one that
 * already has sibling rows, those siblings carry the canonical quote-level
 * field values (Customer PO, deposit fields, invoice/payment fields, value,
 * payment terms…). `mirrorToSiblings` only diffs MIRRORED_FIELDS and so
 * no-ops on a pure quote-number change. Without adoption, the joining
 * project ends up with empty/stale quote-level values while siblings show
 * the real data — producing contradictory Order Confirmation gate states
 * across rows of the same quote.
 *
 * This function returns the INBOUND payload the joining project should
 * adopt from its most-recently-updated live sibling. Direction is strictly
 * one-way: joining project ← source sibling. Callers MUST NEVER write the
 * returned payload to siblings.
 *
 * The adoption is single-source by design so that coupled-field units
 * (payment_terms trio, invoice_issued_date pair, deposit cluster) stay
 * internally consistent.
 */

export interface MirroredFieldKey {
  /** camelCase key on the Project object. */
  projKey: string;
}

export interface QuoteAdoptionRow {
  id: string;
  quoteNumber?: string | null;
  deletedAt?: Date | null;
  updatedAt?: Date;
  [key: string]: any;
}

export interface BuildAdoptionInput<P extends QuoteAdoptionRow> {
  optimistic: P;
  prevRow: P | undefined;
  /** Live sibling rows: same quoteNumber, different id, deletedAt null. */
  siblings: ReadonlyArray<P>;
  mirroredFields: ReadonlyArray<MirroredFieldKey>;
  /** Equality predicate matching the store's `sameValue` (Date-by-epoch, null≈undefined). */
  sameValue: (a: any, b: any) => boolean;
}

export interface AdoptionResult<P extends QuoteAdoptionRow> {
  /** The sibling whose values are being adopted (most recently updated). */
  source: P;
  /** Patch to merge into the joining project only — never written to siblings. */
  patch: Partial<P>;
  /** Mirrored-field keys that actually changed via adoption (for audit log). */
  changedKeys: string[];
}

/**
 * Build the adoption payload for a joining project, or return `null` if no
 * adoption should happen.
 *
 * Returns null when:
 *  - `optimistic.quoteNumber` is empty;
 *  - quote number is unchanged from `prevRow` (not a join event);
 *  - no live siblings exist (project starts the group);
 *  - every mirrored field on the joining project already matches the
 *    source sibling (or is user-touched in this commit).
 *
 * Otherwise returns the source sibling, the patch limited to fields whose
 * values actually change, and the list of changed keys for audit logging.
 *
 * User-touched mirrored fields (those where `optimistic[k] !== prevRow[k]`
 * in the same commit) are EXCLUDED from adoption — the user's edit wins
 * and flows outward via the existing mirror path.
 */
export function buildQuoteAdoptionPayload<P extends QuoteAdoptionRow>(
  input: BuildAdoptionInput<P>,
): AdoptionResult<P> | null {
  const { optimistic, prevRow, siblings, mirroredFields, sameValue } = input;

  const qn = optimistic.quoteNumber ?? null;
  if (!qn) return null;
  const prevQn = prevRow?.quoteNumber ?? null;
  if (prevQn === qn) return null; // not a join event

  if (siblings.length === 0) return null;

  // Pick the most-recently-updated live sibling as the single source.
  // Stable secondary sort by id so behaviour is deterministic when
  // updatedAt timestamps tie (e.g. seeded test data).
  const source = siblings.slice().sort((a, b) => {
    const at = a.updatedAt instanceof Date ? a.updatedAt.getTime() : 0;
    const bt = b.updatedAt instanceof Date ? b.updatedAt.getTime() : 0;
    if (bt !== at) return bt - at;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  })[0];

  // Fields the user changed in this same commit — they win and flow OUT.
  const userTouched = new Set<string>();
  for (const f of mirroredFields) {
    const cur = (optimistic as any)[f.projKey];
    const prev = prevRow ? (prevRow as any)[f.projKey] : undefined;
    if (!sameValue(cur, prev)) userTouched.add(f.projKey);
  }

  const patch: Partial<P> = {};
  const changedKeys: string[] = [];
  for (const f of mirroredFields) {
    if (userTouched.has(f.projKey)) continue;
    const sourceVal = (source as any)[f.projKey];
    const curVal = (optimistic as any)[f.projKey];
    if (!sameValue(sourceVal, curVal)) {
      (patch as any)[f.projKey] = sourceVal;
      changedKeys.push(f.projKey);
    }
  }

  if (changedKeys.length === 0) return null;
  return { source, patch, changedKeys };
}
