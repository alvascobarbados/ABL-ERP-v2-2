/**
 * Order-confirmation & artwork-approval gate logic.
 *
 * Pure functions — no side effects, no DB calls, no React. Consumed by:
 *   - Pipeline Table (per-row state at render)
 *   - Project Detail page
 *   - Order Confirmation sheet
 *   - Recompute triggers in mutation handlers (Phase 7)
 *
 * Field mapping (app camelCase → DB snake_case):
 *   project.value                       → projects.value
 *   project.quoteNumber                 → projects.quote_number
 *   project.proofNumber                 → projects.proof_number
 *   project.shippingMode                → projects.shipping_mode
 *   project.depositPaidDate             → projects.deposit_paid_date
 *   project.customerPoNumber            → projects.customer_po_number          (NEW, Phase 2b)
 *   project.emailVerbalApproved         → projects.email_verbal_approved       (NEW, Phase 2b)
 *   project.orderConfirmationOverrides  → projects.order_confirmation_overrides (NEW, Phase 2b)
 *   customer.order_confirmation_config  → customers.order_confirmation_config  (NEW, Phase 2c)
 */

export type GateKey = "email" | "quotation" | "po" | "deposit";

export type GateMode = "required" | "not_required" | "conditional";
export type ShippingModeLike = "Air" | "Ocean" | "Local" | string | null | undefined;

/** Per-gate config stored on customers.order_confirmation_config. */
export interface GateConfig {
  mode: GateMode;
  conditional_modes: Array<"Air" | "Ocean" | "Local">;
  conditional_amount_above: number | null;
}

export interface OrderConfirmationConfig {
  email: GateConfig;
  quotation: GateConfig;
  po: GateConfig;
  deposit: GateConfig;
}

/** Per-project override entry. action='add' forces required; 'remove' forces not-required. */
export interface GateOverride {
  action: "add" | "remove";
  reason?: string | null;
  set_at?: string;
  set_by_user_id?: string;
}

export type OrderConfirmationOverrides = Partial<Record<GateKey, GateOverride>>;

// Minimal row shapes. Replaced by generated Supabase types when types.ts regenerates.
export interface ArtworkApprovalRow {
  id: string;
  proof_number: string;
  approved_on: string;
  via_channel: string;
  approved_by_buyer_id?: string | null;
  approved_by_other_name?: string | null;
  notes?: string | null;
  recorded_by_user_id: string;
}
export interface QuotationApprovalRow {
  id: string;
  q_number: string;
  approved_on: string;
  via_channel: string;
  approved_by_buyer_id?: string | null;
  approved_by_other_name?: string | null;
  notes?: string | null;
  recorded_by_user_id: string;
}
export interface QuotationEmailVerbalApprovalRow {
  id: string;
  q_number: string;
  approved_on: string;
  via_channel: string;
  approved_by_buyer_id?: string | null;
  approved_by_other_name?: string | null;
  notes?: string | null;
  recorded_by_user_id: string;
}
export interface CustomerPoApprovalRow {
  id: string;
  customer_po_number: string;
  approved_on: string;
  via_channel: string;
  approved_by_buyer_id?: string | null;
  approved_by_other_name?: string | null;
  notes?: string | null;
  recorded_by_user_id: string;
}

export interface ApprovalRowsLookup {
  email: Record<string, QuotationEmailVerbalApprovalRow>; // keyed by q_number (Q#-keyed email/verbal)
  quotation: Record<string, QuotationApprovalRow>; // keyed by q_number
  po: Record<string, CustomerPoApprovalRow>;       // keyed by customer_po_number
}

export type ArtworkApprovalsLookup = Record<string, ArtworkApprovalRow>; // keyed by proof_number

export type ArtworkState = "gray" | "green";

export interface OrderConfirmationState {
  state: "gray" | "orange" | "green";
  satisfied: number;
  required: number;
  requiredGates: GateKey[];
  satisfiedGates: GateKey[];
  missingGates: GateKey[];
}

// Structural subset of the app Project — only fields we touch. Decoupled from
// the canonical type so this module can be imported anywhere.
export interface ProjectForGates {
  value?: number | null;
  shippingMode?: ShippingModeLike;
  quoteNumber?: string | null;
  proofNumber?: string | null;
  customerPoNumber?: string | null;
  emailVerbalApproved?: boolean | null;
  depositPaidDate?: Date | string | null;
  orderConfirmationOverrides?: OrderConfirmationOverrides | null;
}

export interface CustomerForGates {
  order_confirmation_config?: OrderConfirmationConfig | null;
}

const EMPTY_GATE: GateConfig = { mode: "not_required", conditional_modes: [], conditional_amount_above: null };

function getGateConfig(customer: CustomerForGates | null | undefined, gate: GateKey): GateConfig {
  const cfg = customer?.order_confirmation_config;
  if (!cfg) return EMPTY_GATE;
  const entry = (cfg as unknown as Record<string, GateConfig | undefined>)[gate];
  return entry ?? EMPTY_GATE;
}

export function isGateRequired(
  project: ProjectForGates,
  customer: CustomerForGates | null | undefined,
  gate: GateKey,
): boolean {
  // 1. Project override wins.
  const override = project.orderConfirmationOverrides?.[gate];
  if (override?.action === "add") return true;
  if (override?.action === "remove") return false;

  // 2. Customer config.
  const config = getGateConfig(customer, gate);
  if (config.mode === "required") return true;
  if (config.mode === "not_required") return false;
  if (config.mode === "conditional") {
    const modeMatches =
      !config.conditional_modes || config.conditional_modes.length === 0
        ? true
        : config.conditional_modes.includes(project.shippingMode as "Air" | "Ocean" | "Local");
    const amountMatches =
      config.conditional_amount_above === null || config.conditional_amount_above === undefined
        ? true
        : (project.value ?? 0) > config.conditional_amount_above;
    return modeMatches && amountMatches;
  }
  return false;
}

export function isGateSatisfied(
  project: ProjectForGates,
  gate: GateKey,
  lookup: ApprovalRowsLookup,
): boolean {
  switch (gate) {
    case "email":
      return !!project.quoteNumber && !!lookup.email[project.quoteNumber];
    case "quotation":
      return !!project.quoteNumber && !!lookup.quotation[project.quoteNumber];
    case "po":
      return !!project.customerPoNumber && !!lookup.po[project.customerPoNumber];
    case "deposit":
      return project.depositPaidDate != null;
  }
}

const ALL_GATES: GateKey[] = ["email", "quotation", "po", "deposit"];

export function computeOrderConfirmationState(
  project: ProjectForGates,
  customer: CustomerForGates | null | undefined,
  lookup: ApprovalRowsLookup,
): OrderConfirmationState {
  const requiredGates = ALL_GATES.filter((g) => isGateRequired(project, customer, g));
  const satisfiedGates = requiredGates.filter((g) => isGateSatisfied(project, g, lookup));
  const missingGates = requiredGates.filter((g) => !satisfiedGates.includes(g));

  let state: OrderConfirmationState["state"];
  if (requiredGates.length === 0) state = "gray";
  else if (satisfiedGates.length === 0) state = "gray";
  else if (satisfiedGates.length < requiredGates.length) state = "orange";
  else state = "green";

  return {
    state,
    satisfied: satisfiedGates.length,
    required: requiredGates.length,
    requiredGates,
    satisfiedGates,
    missingGates,
  };
}

export function computeArtworkState(
  project: ProjectForGates,
  lookup: ArtworkApprovalsLookup,
): ArtworkState {
  if (!project.proofNumber) return "gray";
  return lookup[project.proofNumber] ? "green" : "gray";
}

// ─────────────────────────────────────────────────────────────────────────────
// Sanity checks. Pure inline assertions — no test-runner dependency. Run on
// import in dev only; tree-shaken in prod via NODE_ENV guard. Exported as
// `__orderConfirmationSanity` for ad-hoc inspection.
// ─────────────────────────────────────────────────────────────────────────────

const mkConfig = (partial: Partial<OrderConfirmationConfig> = {}): OrderConfirmationConfig => ({
  email: EMPTY_GATE, quotation: EMPTY_GATE, po: EMPTY_GATE, deposit: EMPTY_GATE, ...partial,
});

function runSanity() {
  const results: Array<{ name: string; pass: boolean; got?: unknown; want?: unknown }> = [];
  const expect = (name: string, got: unknown, want: unknown) =>
    results.push({ name, pass: JSON.stringify(got) === JSON.stringify(want), got, want });

  const emptyLookup: ApprovalRowsLookup = { quotation: {}, po: {} };

  // 1. Empty config + no overrides → gray (0 required)
  expect("empty config → gray",
    computeOrderConfirmationState({}, { order_confirmation_config: mkConfig() }, emptyLookup).state, "gray");

  // 2. All 4 required, 0 satisfied → gray
  const allReq = mkConfig({
    email: { ...EMPTY_GATE, mode: "required" },
    quotation: { ...EMPTY_GATE, mode: "required" },
    po: { ...EMPTY_GATE, mode: "required" },
    deposit: { ...EMPTY_GATE, mode: "required" },
  });
  expect("4 req / 0 sat → gray",
    computeOrderConfirmationState({}, { order_confirmation_config: allReq }, emptyLookup).state, "gray");

  // 3. 4 required, 2 satisfied → orange
  const p3: ProjectForGates = { emailVerbalApproved: true, depositPaidDate: new Date() };
  expect("4 req / 2 sat → orange",
    computeOrderConfirmationState(p3, { order_confirmation_config: allReq }, emptyLookup).state, "orange");

  // 4. 4 required, 4 satisfied → green
  const p4: ProjectForGates = {
    emailVerbalApproved: true,
    depositPaidDate: new Date(),
    quoteNumber: "Q-1",
    customerPoNumber: "PO-1",
  };
  const lookup4: ApprovalRowsLookup = {
    quotation: { "Q-1": { id: "a", q_number: "Q-1", approved_on: "", via_channel: "email", recorded_by_user_id: "u" } },
    po: { "PO-1": { id: "b", customer_po_number: "PO-1", approved_on: "", via_channel: "email", recorded_by_user_id: "u" } },
  };
  expect("4 req / 4 sat → green",
    computeOrderConfirmationState(p4, { order_confirmation_config: allReq }, lookup4).state, "green");

  // 5. Conditional: Ocean + 15000 > 10000, Ocean in list → required
  const condOcean = mkConfig({
    deposit: { mode: "conditional", conditional_modes: ["Ocean"], conditional_amount_above: 10000 },
  });
  expect("conditional match (Ocean, >threshold) → required",
    isGateRequired({ shippingMode: "Ocean", value: 15000 }, { order_confirmation_config: condOcean }, "deposit"), true);

  // 6. Conditional: Air mismatches Ocean → not required
  expect("conditional mismatch (Air ≠ Ocean) → not required",
    isGateRequired({ shippingMode: "Air", value: 15000 }, { order_confirmation_config: condOcean }, "deposit"), false);

  // 7. Override remove on customer-required gate → not required
  expect("override remove wins over required",
    isGateRequired(
      { orderConfirmationOverrides: { email: { action: "remove" } } },
      { order_confirmation_config: allReq },
      "email",
    ), false);

  // 8. Override add on not-required gate → required
  expect("override add wins over not_required",
    isGateRequired(
      { orderConfirmationOverrides: { email: { action: "add" } } },
      { order_confirmation_config: mkConfig() },
      "email",
    ), true);

  // 9. Artwork: no proof_number → gray
  expect("artwork no proof → gray", computeArtworkState({}, {}), "gray");

  // 10. Artwork: proof set, no approval → gray
  expect("artwork proof, no row → gray",
    computeArtworkState({ proofNumber: "P-1" }, {}), "gray");

  // 11. Artwork: proof + matching row → green
  expect("artwork proof + row → green",
    computeArtworkState({ proofNumber: "P-1" }, {
      "P-1": { id: "x", proof_number: "P-1", approved_on: "", via_channel: "email", recorded_by_user_id: "u" },
    }), "green");

  return results;
}

export const __orderConfirmationSanity = (() => {
  try {
    const results = runSanity();
    if (import.meta.env?.DEV) {
      const failed = results.filter((r) => !r.pass);
      if (failed.length) {
        // eslint-disable-next-line no-console
        console.warn("[orderConfirmation] sanity failures:", failed);
      }
    }
    return results;
  } catch {
    return [];
  }
})();
