import { describe, it, expect } from "vitest";
import {
  poApprovalKey,
  isGateRequired,
  isGateSatisfied,
  computeOrderConfirmationState,
  computeArtworkState,
  type ApprovalRowsLookup,
  type ArtworkApprovalsLookup,
  type CustomerForGates,
  type GateConfig,
  type OrderConfirmationConfig,
  type ProjectForGates,
} from "@/lib/orderConfirmation";

const EMPTY_GATE: GateConfig = {
  mode: "not_required",
  conditional_modes: [],
  conditional_amount_above: null,
};

const mkConfig = (p: Partial<OrderConfirmationConfig> = {}): OrderConfirmationConfig => ({
  email: EMPTY_GATE,
  quotation: EMPTY_GATE,
  po: EMPTY_GATE,
  deposit: EMPTY_GATE,
  ...p,
});

const mkCustomer = (cfg: OrderConfirmationConfig | null): CustomerForGates => ({
  order_confirmation_config: cfg,
});

const emptyLookup: ApprovalRowsLookup = { email: {}, quotation: {}, po: {} };

const emailRow = (q: string) => ({
  id: "e", q_number: q, approved_on: "", via_channel: "email", recorded_by_user_id: "u",
});
const qRow = (q: string) => ({
  id: "a", q_number: q, approved_on: "", via_channel: "email", recorded_by_user_id: "u",
});
const poRow = (q: string, po: string) => ({
  id: "b", customer_po_number: po, quote_number: q, approved_on: "", via_channel: "email", recorded_by_user_id: "u",
});

describe("poApprovalKey", () => {
  it("returns Q|PO when both present", () => {
    expect(poApprovalKey("Q-1", "PO-9")).toBe("Q-1|PO-9");
  });
  it("returns null when quote missing", () => {
    expect(poApprovalKey(null, "PO-9")).toBeNull();
    expect(poApprovalKey(undefined, "PO-9")).toBeNull();
    expect(poApprovalKey("", "PO-9")).toBeNull();
  });
  it("returns null when po missing", () => {
    expect(poApprovalKey("Q-1", null)).toBeNull();
    expect(poApprovalKey("Q-1", undefined)).toBeNull();
    expect(poApprovalKey("Q-1", "")).toBeNull();
  });
});

describe("isGateRequired — overrides", () => {
  const reqCfg = mkConfig({ email: { ...EMPTY_GATE, mode: "required" } });
  const noReqCfg = mkConfig({ email: { ...EMPTY_GATE, mode: "not_required" } });

  it("override action='add' forces required even when customer says not_required", () => {
    const p: ProjectForGates = { orderConfirmationOverrides: { email: { action: "add" } } };
    expect(isGateRequired(p, mkCustomer(noReqCfg), "email")).toBe(true);
  });

  it("override action='remove' forces not-required even when customer says required", () => {
    const p: ProjectForGates = { orderConfirmationOverrides: { email: { action: "remove" } } };
    expect(isGateRequired(p, mkCustomer(reqCfg), "email")).toBe(false);
  });
});

describe("isGateRequired — customer config modes", () => {
  it("mode='required' → true", () => {
    const cfg = mkConfig({ email: { ...EMPTY_GATE, mode: "required" } });
    expect(isGateRequired({}, mkCustomer(cfg), "email")).toBe(true);
  });
  it("mode='not_required' → false", () => {
    const cfg = mkConfig({ email: { ...EMPTY_GATE, mode: "not_required" } });
    expect(isGateRequired({}, mkCustomer(cfg), "email")).toBe(false);
  });
  it("no customer config at all → false (EMPTY_GATE)", () => {
    expect(isGateRequired({}, null, "email")).toBe(false);
    expect(isGateRequired({}, undefined, "email")).toBe(false);
    expect(isGateRequired({}, mkCustomer(null), "email")).toBe(false);
  });
});

describe("isGateRequired — conditional by shipping mode", () => {
  it("matching shipping mode → true", () => {
    const cfg = mkConfig({
      deposit: { mode: "conditional", conditional_modes: ["Ocean"], conditional_amount_above: null },
    });
    expect(isGateRequired({ shippingMode: "Ocean" }, mkCustomer(cfg), "deposit")).toBe(true);
  });
  it("non-matching shipping mode → false", () => {
    const cfg = mkConfig({
      deposit: { mode: "conditional", conditional_modes: ["Ocean"], conditional_amount_above: null },
    });
    expect(isGateRequired({ shippingMode: "Air" }, mkCustomer(cfg), "deposit")).toBe(false);
  });
  it("empty conditional_modes array = matches all modes", () => {
    const cfg = mkConfig({
      deposit: { mode: "conditional", conditional_modes: [], conditional_amount_above: null },
    });
    expect(isGateRequired({ shippingMode: "Air" }, mkCustomer(cfg), "deposit")).toBe(true);
    expect(isGateRequired({ shippingMode: "Ocean" }, mkCustomer(cfg), "deposit")).toBe(true);
    expect(isGateRequired({ shippingMode: null }, mkCustomer(cfg), "deposit")).toBe(true);
  });
});

describe("isGateRequired — conditional by amount", () => {
  const cfg = mkConfig({
    deposit: { mode: "conditional", conditional_modes: [], conditional_amount_above: 10000 },
  });
  it("value above threshold → true", () => {
    expect(isGateRequired({ value: 15000 }, mkCustomer(cfg), "deposit")).toBe(true);
  });
  it("value equal to threshold → false (strict greater-than)", () => {
    // Pin current behavior: uses `>` not `>=`. Equal does NOT count.
    expect(isGateRequired({ value: 10000 }, mkCustomer(cfg), "deposit")).toBe(false);
  });
  it("value below threshold → false", () => {
    expect(isGateRequired({ value: 5000 }, mkCustomer(cfg), "deposit")).toBe(false);
  });
  it("missing value treated as 0 → false", () => {
    expect(isGateRequired({}, mkCustomer(cfg), "deposit")).toBe(false);
  });
  it("null threshold = matches all amounts", () => {
    const noThresh = mkConfig({
      deposit: { mode: "conditional", conditional_modes: [], conditional_amount_above: null },
    });
    expect(isGateRequired({ value: 0 }, mkCustomer(noThresh), "deposit")).toBe(true);
    expect(isGateRequired({}, mkCustomer(noThresh), "deposit")).toBe(true);
  });
});

describe("isGateRequired — mode + amount combined", () => {
  const cfg = mkConfig({
    deposit: { mode: "conditional", conditional_modes: ["Ocean"], conditional_amount_above: 10000 },
  });
  it("both match → true", () => {
    expect(isGateRequired({ shippingMode: "Ocean", value: 15000 }, mkCustomer(cfg), "deposit")).toBe(true);
  });
  it("mode matches, amount fails → false", () => {
    expect(isGateRequired({ shippingMode: "Ocean", value: 5000 }, mkCustomer(cfg), "deposit")).toBe(false);
  });
  it("amount matches, mode fails → false", () => {
    expect(isGateRequired({ shippingMode: "Air", value: 15000 }, mkCustomer(cfg), "deposit")).toBe(false);
  });
});

describe("isGateSatisfied", () => {
  it("email: keyed by quoteNumber; present → true", () => {
    const lookup: ApprovalRowsLookup = { ...emptyLookup, email: { "Q-1": emailRow("Q-1") } };
    expect(isGateSatisfied({ quoteNumber: "Q-1" }, "email", lookup)).toBe(true);
  });
  it("email: missing quoteNumber → false", () => {
    const lookup: ApprovalRowsLookup = { ...emptyLookup, email: { "Q-1": emailRow("Q-1") } };
    expect(isGateSatisfied({}, "email", lookup)).toBe(false);
  });
  it("email: quote present but no row → false", () => {
    expect(isGateSatisfied({ quoteNumber: "Q-9" }, "email", emptyLookup)).toBe(false);
  });

  it("quotation: keyed by quoteNumber; present → true", () => {
    const lookup: ApprovalRowsLookup = { ...emptyLookup, quotation: { "Q-1": qRow("Q-1") } };
    expect(isGateSatisfied({ quoteNumber: "Q-1" }, "quotation", lookup)).toBe(true);
  });
  it("quotation: missing quoteNumber → false", () => {
    const lookup: ApprovalRowsLookup = { ...emptyLookup, quotation: { "Q-1": qRow("Q-1") } };
    expect(isGateSatisfied({}, "quotation", lookup)).toBe(false);
  });

  it("po: satisfied by presence of both quoteNumber + customerPoNumber (auto-approved on entry)", () => {
    expect(isGateSatisfied({ quoteNumber: "Q-1", customerPoNumber: "PO-1" }, "po", emptyLookup)).toBe(true);
  });
  it("po: missing customerPoNumber → false", () => {
    expect(isGateSatisfied({ quoteNumber: "Q-1" }, "po", emptyLookup)).toBe(false);
  });
  it("po: missing quoteNumber → false", () => {
    expect(isGateSatisfied({ customerPoNumber: "PO-1" }, "po", emptyLookup)).toBe(false);
  });
  it("po: whitespace-only customerPoNumber → false", () => {
    expect(isGateSatisfied({ quoteNumber: "Q-1", customerPoNumber: "   " }, "po", emptyLookup)).toBe(false);
  });

  it("deposit: any non-null depositPaidDate → true (Date)", () => {
    expect(isGateSatisfied({ depositPaidDate: new Date() }, "deposit", emptyLookup)).toBe(true);
  });
  it("deposit: any non-null depositPaidDate → true (string)", () => {
    expect(isGateSatisfied({ depositPaidDate: "2026-01-01" }, "deposit", emptyLookup)).toBe(true);
  });
  it("deposit: null/undefined → false", () => {
    expect(isGateSatisfied({ depositPaidDate: null }, "deposit", emptyLookup)).toBe(false);
    expect(isGateSatisfied({}, "deposit", emptyLookup)).toBe(false);
  });
});

describe("computeOrderConfirmationState", () => {
  const allReq = mkConfig({
    email: { ...EMPTY_GATE, mode: "required" },
    quotation: { ...EMPTY_GATE, mode: "required" },
    po: { ...EMPTY_GATE, mode: "required" },
    deposit: { ...EMPTY_GATE, mode: "required" },
  });

  it("0 gates required → gray", () => {
    const r = computeOrderConfirmationState({}, mkCustomer(mkConfig()), emptyLookup);
    expect(r.state).toBe("gray");
    expect(r.required).toBe(0);
    expect(r.satisfied).toBe(0);
    expect(r.requiredGates).toEqual([]);
  });

  it("all required satisfied → green", () => {
    const p: ProjectForGates = {
      quoteNumber: "Q-1", customerPoNumber: "PO-1", depositPaidDate: new Date(),
    };
    const lookup: ApprovalRowsLookup = {
      email: { "Q-1": emailRow("Q-1") },
      quotation: { "Q-1": qRow("Q-1") },
      po: { "Q-1|PO-1": poRow("Q-1", "PO-1") },
    };
    const r = computeOrderConfirmationState(p, mkCustomer(allReq), lookup);
    expect(r.state).toBe("green");
    expect(r.required).toBe(4);
    expect(r.satisfied).toBe(4);
    expect(r.missingGates).toEqual([]);
  });

  it("some-but-not-all satisfied → orange", () => {
    const p: ProjectForGates = { quoteNumber: "Q-1", depositPaidDate: new Date() };
    const lookup: ApprovalRowsLookup = { ...emptyLookup, email: { "Q-1": emailRow("Q-1") } };
    const r = computeOrderConfirmationState(p, mkCustomer(allReq), lookup);
    expect(r.state).toBe("orange");
    expect(r.satisfied).toBe(2); // email + deposit
    expect(r.required).toBe(4);
    expect(r.satisfiedGates.sort()).toEqual(["deposit", "email"]);
    expect(r.missingGates.sort()).toEqual(["po", "quotation"]);
  });

  it("none satisfied → gray (current behavior)", () => {
    const r = computeOrderConfirmationState({}, mkCustomer(allReq), emptyLookup);
    expect(r.state).toBe("gray");
    expect(r.required).toBe(4);
    expect(r.satisfied).toBe(0);
    expect(r.missingGates.sort()).toEqual(["deposit", "email", "po", "quotation"]);
  });

  it("requiredGates contains only required gate keys", () => {
    const cfg = mkConfig({
      email: { ...EMPTY_GATE, mode: "required" },
      deposit: { ...EMPTY_GATE, mode: "required" },
    });
    const r = computeOrderConfirmationState({}, mkCustomer(cfg), emptyLookup);
    expect(r.requiredGates.sort()).toEqual(["deposit", "email"]);
  });
});

describe("computeArtworkState", () => {
  it("no proof number → gray (current behavior)", () => {
    expect(computeArtworkState({}, {})).toBe("gray");
    expect(computeArtworkState({ proofNumber: null }, {})).toBe("gray");
  });
  it("proof number present + approval row exists → green", () => {
    const lookup: ArtworkApprovalsLookup = {
      "P-1": { id: "x", proof_number: "P-1", approved_on: "", via_channel: "email", recorded_by_user_id: "u" },
    };
    expect(computeArtworkState({ proofNumber: "P-1" }, lookup)).toBe("green");
  });
  it("proof number present + no matching row → gray", () => {
    expect(computeArtworkState({ proofNumber: "P-1" }, {})).toBe("gray");
  });
});
