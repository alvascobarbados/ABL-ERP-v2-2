import { describe, it, expect } from "vitest";
import { buildQuoteAdoptionPayload } from "@/lib/quoteAdoption";

// Equality predicate matching the store's `sameValue` (Date-by-epoch, null≈undefined).
const sameValue = (a: any, b: any): boolean => {
  if (a == null && b == null) return true;
  if (a instanceof Date || b instanceof Date) {
    const aT = a instanceof Date ? a.getTime() : a == null ? null : new Date(a).getTime();
    const bT = b instanceof Date ? b.getTime() : b == null ? null : new Date(b).getTime();
    return aT === bT;
  }
  return a === b;
};

// 17 mirrored field keys, mirroring MIRRORED_FIELDS in usePipelineStore.tsx.
const MIRRORED = [
  "depositRequired",
  "depositInvoiceNumber",
  "depositAmount",
  "depositPaidDate",
  "depositPaidMethod",
  "depositPaymentReference",
  "invoiceNumber",
  "paidOnDate",
  "paymentMethod",
  "paymentReference",
  "value",
  "paymentTerms",
  "paymentTermsCustomDays",
  "paymentTermsInherited",
  "invoiceIssuedDate",
  "invoiceIssuedDateAssumed",
  "customerPoNumber",
].map((projKey) => ({ projKey }));

type Row = {
  id: string;
  quoteNumber?: string | null;
  deletedAt?: Date | null;
  updatedAt?: Date;
  [k: string]: any;
};

const emptyMirroredValues = () =>
  Object.fromEntries(MIRRORED.map((f) => [f.projKey, undefined])) as Record<string, any>;

const fullSibling = (overrides: Partial<Row> = {}): Row => ({
  id: "sib-1",
  quoteNumber: "Q-1",
  updatedAt: new Date("2026-06-01T10:00:00Z"),
  depositRequired: true,
  depositInvoiceNumber: "DI-9",
  depositAmount: 1500,
  depositPaidDate: new Date("2026-05-20T00:00:00Z"),
  depositPaidMethod: "wire",
  depositPaymentReference: "REF-DEP",
  invoiceNumber: "INV-77",
  paidOnDate: new Date("2026-05-30T00:00:00Z"),
  paymentMethod: "wire",
  paymentReference: "REF-77",
  value: 12000,
  paymentTerms: "Net 30",
  paymentTermsCustomDays: null,
  paymentTermsInherited: false,
  invoiceIssuedDate: new Date("2026-05-15T00:00:00Z"),
  invoiceIssuedDateAssumed: false,
  customerPoNumber: "PO00055442",
  ...overrides,
});

describe("buildQuoteAdoptionPayload — trigger condition", () => {
  it("returns null when optimistic has no quoteNumber", () => {
    const r = buildQuoteAdoptionPayload({
      optimistic: { id: "p1", quoteNumber: null, ...emptyMirroredValues() },
      prevRow: { id: "p1", quoteNumber: null, ...emptyMirroredValues() },
      siblings: [fullSibling()],
      mirroredFields: MIRRORED,
      sameValue,
    });
    expect(r).toBeNull();
  });

  it("returns null when quoteNumber unchanged (no-op)", () => {
    const r = buildQuoteAdoptionPayload({
      optimistic: { id: "p1", quoteNumber: "Q-1", customerPoNumber: "X", ...emptyMirroredValues() },
      prevRow:   { id: "p1", quoteNumber: "Q-1", customerPoNumber: "X", ...emptyMirroredValues() },
      siblings: [fullSibling()],
      mirroredFields: MIRRORED,
      sameValue,
    });
    expect(r).toBeNull();
  });

  it("returns null when joining and no live siblings exist", () => {
    const r = buildQuoteAdoptionPayload({
      optimistic: { id: "p1", quoteNumber: "Q-1", ...emptyMirroredValues() },
      prevRow:   { id: "p1", quoteNumber: null,  ...emptyMirroredValues() },
      siblings: [],
      mirroredFields: MIRRORED,
      sameValue,
    });
    expect(r).toBeNull();
  });

  it("treats a CHANGE from one quote to another as a join event", () => {
    const r = buildQuoteAdoptionPayload({
      optimistic: { id: "p1", quoteNumber: "Q-2", ...emptyMirroredValues() },
      prevRow:   { id: "p1", quoteNumber: "Q-1", ...emptyMirroredValues() },
      siblings: [fullSibling({ id: "sib-2", quoteNumber: "Q-2" })],
      mirroredFields: MIRRORED,
      sameValue,
    });
    expect(r).not.toBeNull();
    expect(r!.source.id).toBe("sib-2");
  });
});

describe("buildQuoteAdoptionPayload — adoption payload", () => {
  it("adopts all 17 mirrored fields from the sibling on first join", () => {
    const r = buildQuoteAdoptionPayload({
      optimistic: { id: "p1", quoteNumber: "Q-1", ...emptyMirroredValues() },
      prevRow:   { id: "p1", quoteNumber: null,   ...emptyMirroredValues() },
      siblings: [fullSibling()],
      mirroredFields: MIRRORED,
      sameValue,
    });
    expect(r).not.toBeNull();
    expect(r!.changedKeys.sort()).toEqual(
      [
        "customerPoNumber",
        "depositAmount",
        "depositInvoiceNumber",
        "depositPaidDate",
        "depositPaidMethod",
        "depositPaymentReference",
        "depositRequired",
        "invoiceIssuedDate",
        // invoiceIssuedDateAssumed is `false` on source — same as undefined? NO,
        // sameValue treats null/undefined as equal but false !== undefined.
        "invoiceIssuedDateAssumed",
        "invoiceNumber",
        "paidOnDate",
        "paymentMethod",
        "paymentReference",
        "paymentTerms",
        // paymentTermsCustomDays is null on source, undefined on joining → equal → not changed.
        "paymentTermsInherited",
        "value",
      ].sort(),
    );
    expect(r!.patch.customerPoNumber).toBe("PO00055442");
    expect(r!.patch.value).toBe(12000);
    expect(r!.patch.paymentTerms).toBe("Net 30");
  });

  it("picks the MOST RECENTLY UPDATED sibling as source", () => {
    const older = fullSibling({ id: "sib-old", updatedAt: new Date("2026-01-01T00:00:00Z"), customerPoNumber: "OLD-PO" });
    const newer = fullSibling({ id: "sib-new", updatedAt: new Date("2026-06-10T00:00:00Z"), customerPoNumber: "NEW-PO" });
    const r = buildQuoteAdoptionPayload({
      optimistic: { id: "p1", quoteNumber: "Q-1", ...emptyMirroredValues() },
      prevRow:   { id: "p1", quoteNumber: null,   ...emptyMirroredValues() },
      siblings: [older, newer],
      mirroredFields: MIRRORED,
      sameValue,
    });
    expect(r!.source.id).toBe("sib-new");
    expect(r!.patch.customerPoNumber).toBe("NEW-PO");
  });

  it("EXCLUDES user-touched fields (user edit wins, flows OUT via mirror)", () => {
    // User joined Q-1 AND set customerPoNumber to "USER-PO" in the same commit.
    const r = buildQuoteAdoptionPayload({
      optimistic: { ...emptyMirroredValues(), id: "p1", quoteNumber: "Q-1", customerPoNumber: "USER-PO" },
      prevRow:   { ...emptyMirroredValues(), id: "p1", quoteNumber: null,   customerPoNumber: undefined },
      siblings: [fullSibling()],
      mirroredFields: MIRRORED,
      sameValue,
    });
    expect(r).not.toBeNull();
    // customerPoNumber not in patch: user-touched, kept as USER-PO.
    expect(r!.changedKeys).not.toContain("customerPoNumber");
    expect((r!.patch as any).customerPoNumber).toBeUndefined();
    // Other fields still adopted.
    expect(r!.patch.paymentTerms).toBe("Net 30");
    expect(r!.patch.value).toBe(12000);
  });

  it("returns null when joining project ALREADY matches sibling on every mirrored field", () => {
    const same = fullSibling();
    const r = buildQuoteAdoptionPayload({
      optimistic: { ...same, id: "p1", quoteNumber: "Q-1" },
      prevRow:   { ...same, id: "p1", quoteNumber: null }, // join event, but values identical
      siblings: [same],
      mirroredFields: MIRRORED,
      sameValue,
    });
    expect(r).toBeNull();
  });

  it("when joining project has pre-existing values, ONLY mismatched mirrored fields adopt (and patch never targets siblings)", () => {
    // Joining project has its own non-empty payment_terms already; adoption
    // overwrites it to match the quote-group canonical value.
    const r = buildQuoteAdoptionPayload({
      optimistic: { id: "p1", quoteNumber: "Q-1", paymentTerms: "STALE", value: 12000, ...{} },
      prevRow:   { id: "p1", quoteNumber: null,   paymentTerms: "STALE", value: 12000 },
      siblings: [fullSibling()], // paymentTerms "Net 30", value 12000
      mirroredFields: MIRRORED,
      sameValue,
    });
    expect(r).not.toBeNull();
    expect(r!.patch.paymentTerms).toBe("Net 30");
    // value matched → not in patch.
    expect(r!.changedKeys).not.toContain("value");
    // Patch keys exist only on the joining project; the contract is that
    // callers MUST NOT push this patch outward. The function returns the
    // patch only — it never references sibling ids in writable form.
    expect(r!.source.id).toBe("sib-1");
  });
});
