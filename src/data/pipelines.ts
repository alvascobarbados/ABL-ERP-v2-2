// ─────────── Flat project data model ───────────
// Every card is one Project: customer + project name + (optional) detail summary,
// one supplier max, one shipping mode max, line items.
// Shared "project name" across multiple cards is just a naming convention.

// "operations" is the legacy id for the Production pipeline. Kept in the union
// so historical project_log_entries rows that reference it still type-check.
// All new code should use "production".
export type PipelineId =
  | "sales" | "design" | "purchasing" | "production" | "shipping" | "finance"
  /** @deprecated renamed to "production" */
  | "operations";

export type StageId =
  // sales
  | "proposal" | "quote" | "confirming" | "archive"
  // design
  | "design" | "proof"
  // purchasing — single-state pipeline (procurement: POs, supplier confirmation, deposits)
  | "purchasing"
  // production — single-state pipeline (factory making the goods)
  | "production"
  /** @deprecated split into "purchasing" (pre-production work) and "production" (factory making) */
  | "preproduction"
  /** @deprecated renamed to "production" */
  | "in_production"
  // shipping — NOT real stages anymore. The Shipping pipeline groups by
  // mode (Air / Ocean) + assignment status. The two values below are
  // routing hints only:
  //   shipment_required → no shipment assigned yet (Awaiting Shipment)
  //   shipment_assigned → on a shipment (rendered under Air or Ocean)
  // "Delivered" no longer exists in Shipping — delivered projects move
  // out of Shipping entirely into Finance · Invoice Required.
  | "shipment_required" | "shipment_assigned"
  // finance
  | "invoice_required" | "invoiced" | "paid";

// Three modes only. Carrier (DHL/FedEx/Other) and container (FCL/LCL) live
// inside the trackingRef as a PREFIX-number string.
export type ShippingMode = "Air" | "Ocean" | "Local";

// Built-in known prefixes. "Other" lets users type an arbitrary carrier.
export type OceanPrefix = "FCL" | "LCL";
export type AirPrefix = "DHL" | "FEDEX" | string; // Other → free-text uppercased
export type OrderType = "New" | "Re-order";
export type Priority = "Standard" | "Rush";
export type CardTag = "Cold" | "Lost" | "Other" | "Customs Pending";

export interface PipelineConfig {
  id: PipelineId;
  title: string;
  stages: { id: StageId; title: string }[];
}

export const PIPELINES: PipelineConfig[] = [
  {
    id: "sales",
    title: "Sales",
    // NOTE: "archive" is a valid StageId and projects can still sit in
    // sales/archive, but Archive is NOT a kanban stage anymore — it lives
    // in the left rail (see ArchiveView). Pipeline views, counts, and the
    // StagePicker hide archived projects entirely.
    stages: [
      { id: "proposal", title: "Proposal" },
      { id: "quote", title: "Quote" },
      { id: "confirming", title: "Confirming" },
    ],
  },
  {
    id: "design",
    title: "Design",
    stages: [
      { id: "design", title: "Design" },
      { id: "proof", title: "Proof" },
    ],
  },
  {
    id: "purchasing",
    title: "Purchasing",
    stages: [
      { id: "purchasing", title: "Purchasing" },
    ],
  },
  {
    id: "production",
    title: "Production",
    stages: [
      { id: "production", title: "Production" },
    ],
  },
  {
    id: "shipping",
    title: "Shipping",
    // The Shipping pipeline UI does NOT render by stage — it groups by
    // mode (Air / Ocean) and assignment (Awaiting Shipment). These two
    // entries exist purely so cross-pipeline navigation (next/prev,
    // jiggle picker, friendly labels) still has something to point at.
    stages: [
      { id: "shipment_required", title: "Awaiting Shipment" },
      { id: "shipment_assigned", title: "On Shipment" },
    ],
  },
  {
    id: "finance",
    title: "Finance",
    // "paid" stage still exists in StageId for backward compat and as the
    // canonical marker that a project is COMPLETED. It is intentionally
    // NOT listed here so the Finance pipeline kanban renders only two
    // columns (Invoice Required → Invoiced). Completed projects surface
    // under the dedicated "Completed" scope tab.
    stages: [
      { id: "invoice_required", title: "Invoice Required" },
      { id: "invoiced", title: "Invoiced" },
    ],
  },
];

/** Canonical "this project is completed/paid" check. */
export const isCompletedProject = (p: { pipeline: PipelineId; stage: StageId }) =>
  p.pipeline === "finance" && p.stage === "paid";

export const STAGE_ACCENT: Record<StageId, string> = {
  proposal: "indigo", quote: "amber", confirming: "emerald", archive: "slate",
  design: "magenta", proof: "magenta",
  purchasing: "slate", production: "navy",
  // legacy — kept for historical log-entry rendering
  preproduction: "violet", in_production: "orange",
  shipment_required: "amber", shipment_assigned: "sky",
  invoice_required: "rose", invoiced: "amber", paid: "emerald",
};

// ─────────── Suppliers ───────────
// Legacy seed value: source data still says "Ocean FCL"/"Ocean LCL". The
// runtime migration at the bottom of this file collapses these to the new
// three-mode model ("Air" | "Ocean" | "Local"). Keeping the wider type here
// avoids rewriting every seed entry.
type LegacyShippingMode = ShippingMode | "Ocean FCL" | "Ocean LCL";

export interface Supplier {
  id: string;
  name: string;
  country: string;
  defaultShippingMode: ShippingMode;
  contact: string;
  notes?: string;
}

// Seed list uses the legacy mode strings for readability; migration below
// collapses them to the new three-mode model.
const SUPPLIERS_SEED: (Omit<Supplier, "defaultShippingMode"> & { defaultShippingMode: LegacyShippingMode })[] = [
  { id: "sup-freedom", name: "Freedom Gifts", country: "China", defaultShippingMode: "Ocean FCL", contact: "Lily Wang", notes: "Reliable for promo merch; 30-day lead time." },
  { id: "sup-admax", name: "Admax", country: "China", defaultShippingMode: "Air", contact: "Jason Liu", notes: "Best for banners, flags, large format." },
  { id: "sup-yiwu", name: "Yiwu Star", country: "China", defaultShippingMode: "Ocean LCL", contact: "Mei Chen", notes: "Variety merchandise; budget-friendly." },
  { id: "sup-shenzhen", name: "Shenzhen Print Co", country: "China", defaultShippingMode: "Ocean LCL", contact: "David Park", notes: "Print specialist; signage & POS." },
  { id: "sup-ningbo", name: "Ningbo Textile", country: "China", defaultShippingMode: "Ocean FCL", contact: "Sara Wu", notes: "Textile orders, uniforms, totes." },
  { id: "sup-lp", name: "LP Outdoor", country: "China", defaultShippingMode: "Ocean FCL", contact: "—" },
  { id: "sup-hxin", name: "HXIN", country: "China", defaultShippingMode: "Ocean LCL", contact: "—" },
  { id: "sup-seebox", name: "Seebox", country: "China", defaultShippingMode: "Ocean LCL", contact: "—" },
  { id: "sup-caremax", name: "Caremax", country: "China", defaultShippingMode: "Air", contact: "—" },
  { id: "sup-logomark", name: "Logomark", country: "USA", defaultShippingMode: "Air", contact: "—" },
  { id: "sup-casla", name: "Casla", country: "China", defaultShippingMode: "Ocean LCL", contact: "—" },
  { id: "sup-pcna", name: "PCNA", country: "USA", defaultShippingMode: "Air", contact: "—" },
  { id: "sup-aakron", name: "Aakron Line", country: "USA", defaultShippingMode: "Air", contact: "—" },
  { id: "sup-other-china", name: "Other - China", country: "China", defaultShippingMode: "Ocean LCL", contact: "—" },
  { id: "sup-other-bb", name: "Other - Barbados", country: "Barbados", defaultShippingMode: "Air", contact: "—" },
  { id: "sup-other-usa", name: "Other - USA", country: "USA", defaultShippingMode: "Air", contact: "—" },
  { id: "sup-alvasco", name: "Alvasco (Stock)", country: "Barbados", defaultShippingMode: "Air", contact: "—" },
  { id: "sup-supreme", name: "Supreme Signs", country: "Barbados", defaultShippingMode: "Air", contact: "—" },
  { id: "sup-hit", name: "Hit Promo", country: "USA", defaultShippingMode: "Air", contact: "—" },
  { id: "sup-evans", name: "Evans", country: "USA", defaultShippingMode: "Air", contact: "—" },
  { id: "sup-kingmore", name: "Kingmore", country: "China", defaultShippingMode: "Ocean LCL", contact: "—" },
  { id: "sup-dechno", name: "Dechno", country: "China", defaultShippingMode: "Air", contact: "—" },
  { id: "sup-chili", name: "Chili Concept", country: "China", defaultShippingMode: "Ocean LCL", contact: "—" },
];

// Map legacy mode → new ShippingMode (Ocean FCL/LCL collapse to Ocean).
function migrateMode(legacy: LegacyShippingMode | undefined): ShippingMode | undefined {
  if (!legacy) return undefined;
  if (legacy === "Ocean FCL" || legacy === "Ocean LCL" || legacy === "Ocean") return "Ocean";
  if (legacy === "Air") return "Air";
  if (legacy === "Local") return "Local";
  return undefined;
}

export const SUPPLIERS: Supplier[] = SUPPLIERS_SEED.map((s) => ({
  ...s,
  defaultShippingMode: migrateMode(s.defaultShippingMode) ?? "Ocean",
}));

// ─────────── Project (the only entity now) ───────────
export interface LineItem {
  qty: number;
  description: string;
  /** Unit price in BBD. Optional — line items without a price show "—". */
  unitPrice?: number;
  /** Cached qty * unitPrice. Recomputed on save; never the source of truth. */
  total?: number;
  /** Reserved for the future Products master list. Free-text items have no id. */
  productId?: string;
}

/**
 * Sales-only display hints. Once a project moves into Production, these are
 * dropped in favour of the canonical `supplierId` + `shippingMode` fields,
 * which downstream pipelines use for everything (PO, shipment grouping, etc.).
 */
export type SupplierLabelHint = "TBD" | "Various";
export type SalesShippingLabel =
  | "Ocean FCL" | "Ocean LCL" | "DHL" | "FedEx" | "Courier" | "Mixed" | "Local";

export interface ProjectNote {
  id: string;
  ts: Date;
  /** Snapshot of the author's full name at the time of writing. */
  author: string;
  /** Stable user id — survives display-name changes. */
  authorUserId?: string;
  text: string;
  /** True when the system wrote the note (legacy auto-stage notes). New
   *  code should write to ProjectLogEntry instead — kept for back-compat. */
  auto?: boolean;
}

export type ProjectLogActionType =
  | "stage_change"
  | "field_edit"
  | "flag_toggle"
  | "note_added"
  | "project_created"
  | "archive"
  | "unarchive"
  | "trash"
  | "restore"
  | "mark_paid"
  | "line_item_change";

export interface ProjectLogEntry {
  id: string;
  ts: Date;
  actor: { userId: string; displayName: string };
  actionType: ProjectLogActionType;
  /** Pre-rendered, human-readable sentence (with the actor's name as subject). */
  description: string;
  /** Optional structured payload — keeps the door open to future filtering. */
  metadata?: {
    field?: string;
    fromValue?: unknown;
    toValue?: unknown;
    fromPipeline?: PipelineId;
    fromStage?: StageId;
    toPipeline?: PipelineId;
    toStage?: StageId;
  };
}

export interface Project {
  id: string;
  customer: string;
  contactPerson?: string;       // person at the customer side
  pointPerson: string;          // internal Alvasco owner
  projectName: string;
  detailSummary?: string;       // optional in Sales/Proposal; required from Confirming on
  supplierId?: string;          // required from Confirming on
  supplierLabel?: SupplierLabelHint; // Sales-only: shown when supplierId not yet locked
  shippingMode?: ShippingMode;  // required from Confirming on
  salesShippingLabel?: SalesShippingLabel; // Sales-only display string
  shipmentId?: string;          // assigned in Shipping
  trackingRef?: string;         // free-form / FCL- / LCL- / carrier digits
  pipeline: PipelineId;
  stage: StageId;
  deadline: string;
  deadlineDate: Date;
  value: number;
  orderType: OrderType;
  priority: Priority;
  tag?: CardTag;
  quoteNumber?: string;
  poNumber?: string;
  invoiceNumber?: string;
  lineItems?: LineItem[];
  notes?: ProjectNote[];
  /** Append-only audit trail. Written via the store middleware whenever
   *  any canonical mutation happens. Never user-editable. */
  log?: ProjectLogEntry[];
  // Audit timestamps. createdAt is set when the project first enters the system.
  // updatedAt bumps on every mutation through the store (updateProject, addNote,
  // line-item changes, stage moves). Spreadsheet view sorts/filters by these.
  createdAt: Date;
  updatedAt?: Date;
  // ── Trash (soft-delete) ──────────────────────────────────────────────
  // Set when the project is moved to Trash. Filtered out of every
  // pipeline view, search result, and count. Visible only in TrashView.
  deletedAt?: Date;
  deletedFromPipeline?: PipelineId;
  deletedFromStage?: StageId;
  // ── Flag (needs attention) ───────────────────────────────────────────
  // When true, card receives orange treatment and pins to the top of its
  // containing view. Toggleable from the card three-dots menu and the
  // dedicated flag icon on the card.
  flagged?: boolean;
  // ── Payment terms (inherited from customer at create; per-project override) ──
  paymentTerms?: import("@/lib/paymentTerms").PaymentTermsId;
  paymentTermsCustomDays?: number;
  /** True when paymentTerms came from customer default (not user-overridden on this project). */
  paymentTermsInherited?: boolean;
  /** Date the invoice was issued. Auto-set on transition to Invoiced; user-editable. */
  invoiceIssuedDate?: Date;
  /** True when invoiceIssuedDate is the auto-tracked stage timestamp (not user-edited). */
  invoiceIssuedDateAssumed?: boolean;
  /** Auto-set on transition to Invoice Required (system field). */
  invoiceRequiredEnteredAt?: Date;
  // ── Phase-2 paid-capture fields (nullable; no UI yet) ──
  paidOnDate?: Date | null;
  paymentMethod?: string | null;
  paymentReference?: string | null;
}

/** @deprecated Carriers now live inside `trackingRef` as a PREFIX-number string. */
export type AirCarrier = "DHL" | "FedEx";

export interface Shipment {
  id: string;
  /**
   * Canonical PREFIX-number string. Examples:
   *   FCL-125, LCL-088, DHL-373747, FEDEX-9382749, ARAMEX-49283740
   * Always uppercase prefix, single hyphen, then the user-typed number.
   */
  code: string;
  mode: ShippingMode;
  /** @deprecated read carrier off `code` (the part before the dash). */
  carrier?: AirCarrier;
  supplierId: string;
  etd: Date;
  eta: Date;
  status: "Booked" | "In Transit" | "Customs" | "Delayed" | "Delivered";
}

/**
 * Pull the prefix portion ("FCL", "DHL", "ARAMEX", …) off a tracking ref.
 * Returns `undefined` if the ref isn't in PREFIX-number form.
 */
export function trackingPrefix(ref: string | undefined): string | undefined {
  if (!ref) return undefined;
  const i = ref.indexOf("-");
  if (i <= 0) return undefined;
  return ref.slice(0, i).toUpperCase();
}

/**
 * Canonical bottom-row shipping label for a project card.
 *  Air · DHL-373747
 *  Air · FEDEX-9382749
 *  Ocean · FCL-125
 *  Ocean · LCL-088
 *  Local
 *  Air · —  (mode set, tracking blank)
 *  Ocean · —
 *  — · — (mode unassigned — the "Mixed" / unknown state)
 */
export function formatShippingLabel(
  mode: ShippingMode | undefined,
  trackingRef?: string,
): { text: string; placeholder: boolean } {
  if (!mode) return { text: "— · —", placeholder: true };
  if (mode === "Local") return { text: "Local", placeholder: false };
  const ref = trackingRef?.trim();
  if (!ref) return { text: `${mode} · —`, placeholder: true };
  return { text: `${mode} · ${ref.toUpperCase()}`, placeholder: false };
}

export function formatShipmentTitle(s: Shipment): string {
  // The shipment code already carries the prefix (FCL-125 / DHL-373747).
  return s.code.toUpperCase();
}

// ─────────── Unified pipeline card ───────────
export interface PipelineCard {
  id: string;
  project: Project;
  supplier?: Supplier;
  shipment?: Shipment;
  pipeline: PipelineId;
  stage: StageId;
  deadline: string;
  deadlineDate: Date;
  shippingMode?: ShippingMode;
  orderType: OrderType;
  priority: Priority;
  tag?: CardTag;
}

// ─────────── Helpers ───────────
const d = (m: number, day: number) => new Date(2026, m - 1, day);
const fmt = (date: Date) =>
  `${date.getDate()} ${date.toLocaleString("en-US", { month: "short" })}`;

interface ProjOpts {
  detailSummary?: string;
  supplierId?: string;
  supplierLabel?: SupplierLabelHint;
  // Seed accepts the legacy mode strings ("Ocean FCL"/"Ocean LCL"); the
  // factory below collapses them to the new three-mode model and stashes
  // the prefix into `trackingRef` when applicable.
  shippingMode?: LegacyShippingMode;
  salesShippingLabel?: SalesShippingLabel;
  shipmentId?: string;
  trackingRef?: string;
  orderType?: OrderType;
  priority?: Priority;
  tag?: CardTag;
}

let _seq = 0;
// Deterministic pseudo-random for reproducible seed timestamps. Using a simple
// LCG seeded by _seq so re-runs (and snapshot tests) produce the same dates.
function seededOffset(seed: number, min: number, max: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  const r = x - Math.floor(x);
  return Math.floor(min + r * (max - min));
}
const p = (
  customer: string, pointPerson: string, projectName: string,
  date: Date, value: number, pipeline: PipelineId, stage: StageId,
  opts: ProjOpts = {},
): Project => {
  // Migration: Ocean FCL/LCL → mode "Ocean" + trackingRef prefix hint
  // (only used when the project doesn't already carry a real shipment).
  const newMode = migrateMode(opts.shippingMode);
  let trackingRef = opts.trackingRef;
  if (!trackingRef && !opts.shipmentId) {
    if (opts.shippingMode === "Ocean FCL") trackingRef = undefined; // prefix-only hints surface in the editor
    if (opts.shippingMode === "Ocean LCL") trackingRef = undefined;
  }
  const seq = ++_seq;
  // Back-date createdAt 7–120 days before the deadline so the Spreadsheet
  // view has meaningful chronological data out of the box.
  const daysBack = seededOffset(seq, 7, 120);
  const createdAt = new Date(date.getTime() - daysBack * 24 * 60 * 60 * 1000);
  return {
    id: `prj-${seq}`,
    customer, pointPerson, projectName,
    detailSummary: opts.detailSummary,
    supplierId: opts.supplierId,
    supplierLabel: opts.supplierLabel,
    shippingMode: newMode,
    salesShippingLabel: opts.salesShippingLabel,
    shipmentId: opts.shipmentId,
    trackingRef,
    pipeline, stage,
    deadline: fmt(date), deadlineDate: date,
    value,
    orderType: opts.orderType ?? "New",
    priority: opts.priority ?? "Standard",
    tag: opts.tag,
    createdAt,
  };
};

// ─────────── Mock projects (flat) ───────────
export const PROJECTS: Project[] = [
  // ── SALES · Proposal (early — bare-bones; no right block, no shipping) ──
  p("BTMI", "Melissa McGeary", "Connect Barbados", d(5, 16), 18500, "sales", "proposal",
    { detailSummary: "Welcome party premiums", priority: "Rush" }),
  p("Republic Bank", "Sarah Kim", "AGM 2026", d(5, 12), 12500, "sales", "proposal"),
  p("Hilton Caribbean", "Renee Allen", "Resort Refresh", d(6, 1), 28000, "sales", "proposal",
    { detailSummary: "Lobby refresh — scoping" }),

  // ── SALES · Quote (mixed states: full info / Q- placeholder / TBD / Various / Mixed / Courier) ──
  // Full info — Ocean FCL
  p("Banks Beer", "Kenji Tanaka", "Crop Over 2026", d(5, 22), 41000, "sales", "quote",
    { detailSummary: "Festival giveaways", supplierId: "sup-freedom", salesShippingLabel: "Ocean FCL", orderType: "Re-order" }),
  // Full info — Ocean LCL
  p("Sagicor", "Carlos Gomez", "Sales Conference", d(5, 24), 14500, "sales", "quote",
    { detailSummary: "Awards & trophies", supplierId: "sup-yiwu", salesShippingLabel: "Ocean LCL" }),
  // Full info — DHL
  p("Coca-Cola Caribbean", "Priya Sharma", "Beach Tour", d(5, 13), 38000, "sales", "quote",
    { detailSummary: "Cooler bags & shades", supplierId: "sup-admax", salesShippingLabel: "DHL" }),
  // Full info — FedEx
  p("Goddard Enterprises", "Jenna Park", "Anniversary Gifts", d(5, 29), 9800, "sales", "quote",
    { detailSummary: "Custom desk awards", supplierId: "sup-admax", salesShippingLabel: "FedEx" }),
  // Q- placeholder — quote being prepared, supplier known, Courier
  p("Chefette", "Emily Rodriguez", "Drive-Thru Refresh", d(5, 9), 19000, "sales", "quote",
    { detailSummary: "Branded uniforms", supplierId: "sup-ningbo", salesShippingLabel: "Courier", orderType: "Re-order", priority: "Rush" }),
  // TBD supplier — no PO line
  p("ANSA McAL", "Rachel Green", "Shareholder Pack", d(5, 18), 17500, "sales", "quote",
    { detailSummary: "Annual report bundle", supplierLabel: "TBD", salesShippingLabel: "Ocean LCL" }),
  // Various supplier — Mixed shipping
  p("Caribbean Airlines", "Anna Petrova", "Inflight Refresh", d(5, 21), 62000, "sales", "quote",
    { detailSummary: "Branded amenity kits", supplierLabel: "Various", salesShippingLabel: "Mixed" }),
  // Q- placeholder + TBD supplier
  p("GraceKennedy", "Kenji Tanaka", "Trade Show Kit", d(5, 16), 22000, "sales", "quote",
    { detailSummary: "Booth giveaways", supplierLabel: "TBD", salesShippingLabel: "Ocean FCL", priority: "Rush" }),

  // ── SALES · Confirming (supplier + shipping locked; ready for Production handoff) ──
  p("FLOW Caribbean", "Maria Garcia", "Retail Launch", d(5, 20), 47000, "sales", "confirming",
    { detailSummary: "POS displays", supplierId: "sup-shenzhen", shippingMode: "Ocean FCL" }),
  p("NCB Jamaica", "Sam Jones", "Branch Refresh", d(5, 17), 28000, "sales", "confirming",
    { detailSummary: "Signage & stationery", supplierId: "sup-admax", shippingMode: "Ocean LCL" }),
  p("First Citizens", "Li Wei", "Onboarding Kit", d(5, 19), 13500, "sales", "confirming",
    { detailSummary: "New hire welcome packs", supplierId: "sup-yiwu", shippingMode: "Air", orderType: "Re-order" }),
  p("Demerara Distillers", "Evelyn Reed", "Holiday Gift", d(5, 26), 26000, "sales", "confirming",
    { detailSummary: "Premium rum boxes", supplierId: "sup-ningbo", shippingMode: "Ocean FCL", orderType: "Re-order" }),
  p("Trinidad Cement", "Maria Garcia", "Safety Campaign", d(5, 25), 21000, "sales", "confirming",
    { detailSummary: "Hi-vis branded gear", supplierId: "sup-ningbo", shippingMode: "Ocean FCL" }),
  p("BTMI", "Melissa McGeary", "Connect Barbados", d(5, 16), 18500, "sales", "confirming",
    { detailSummary: "Welcome party premiums", supplierId: "sup-freedom", shippingMode: "Ocean FCL", priority: "Rush" }),
  p("Digicel", "Anya Sharma", "Summer Activation", d(5, 18), 24000, "sales", "confirming",
    { detailSummary: "Branded merchandise kits", supplierId: "sup-admax", shippingMode: "Air" }),
  // ── SALES · Archive ──
  p("PriceSmart", "Omar Hassan", "Membership Drive", d(6, 8), 11000, "sales", "archive",
    { detailSummary: "Branded reusables", tag: "Cold" }),
  p("Courts Caribbean", "Isabelle Dubois", "Storefront Kit", d(6, 12), 8500, "sales", "archive",
    { detailSummary: "Window decals", tag: "Cold" }),
  p("Lucozade Caribbean", "Lena Petrova", "Sports Sponsorship", d(6, 15), 15000, "sales", "archive",
    { detailSummary: "Athlete kits", tag: "Cold", orderType: "Re-order" }),
  p("KFC Barbados", "Javier Rodriguez", "Crew Apparel", d(5, 30), 0, "sales", "archive",
    { detailSummary: "Uniform refresh", tag: "Lost" }),
  p("Subway TT", "Tom Becker", "Loyalty Cards", d(6, 5), 0, "sales", "archive",
    { detailSummary: "Branded card stock", tag: "Lost" }),

  // ── PRODUCTION · Pre-Production ──
  p("Bermudez Group", "Lucia Ramos", "Snack Launch", d(5, 14), 22000, "production", "production",
    { detailSummary: "Acrylic display stands", supplierId: "sup-shenzhen", shippingMode: "Ocean LCL", priority: "Rush" }),
  p("Bermudez Group", "Lucia Ramos", "Snack Launch", d(5, 14), 12000, "production", "production",
    { detailSummary: "POS shelf strips", supplierId: "sup-shenzhen", shippingMode: "Ocean LCL", priority: "Rush" }),
  p("Carib Brewery", "Mark Yeung", "Stadium Activation", d(5, 19), 32000, "production", "production",
    { detailSummary: "Branded coolers", supplierId: "sup-freedom", shippingMode: "Ocean FCL" }),
  p("Carib Brewery", "Mark Yeung", "Stadium Activation", d(5, 19), 20000, "production", "production",
    { detailSummary: "Stadium banners", supplierId: "sup-admax", shippingMode: "Air" }),
  p("WIBISCO", "Aisha Khan", "Biscuit Promo", d(5, 22), 18000, "production", "production",
    { detailSummary: "POS shelf strips", supplierId: "sup-shenzhen", shippingMode: "Ocean LCL" }),
  p("Solo Beverages", "Devon Ali", "Summer SKUs", d(5, 23), 14500, "production", "production",
    { detailSummary: "Custom labels", supplierId: "sup-shenzhen", shippingMode: "Air" }),

  // ── PRODUCTION · In Production ──
  p("BTMI", "Melissa McGeary", "Trade Show", d(5, 17), 14000, "production", "production",
    { detailSummary: "Brochure binders", supplierId: "sup-shenzhen", shippingMode: "Air", priority: "Rush", orderType: "Re-order" }),
  p("BTMI", "Melissa McGeary", "Trade Show", d(5, 17), 14000, "production", "production",
    { detailSummary: "Cotton tote bags", supplierId: "sup-ningbo", shippingMode: "Air", priority: "Rush", orderType: "Re-order" }),
  p("Digicel", "Anya Sharma", "Retail Refresh", d(5, 21), 26000, "production", "production",
    { detailSummary: "Counter displays", supplierId: "sup-shenzhen", shippingMode: "Ocean FCL" }),
  p("Digicel", "Anya Sharma", "Retail Refresh", d(5, 21), 20000, "production", "production",
    { detailSummary: "Crew polos", supplierId: "sup-ningbo", shippingMode: "Ocean FCL" }),
  p("Sandals Resorts", "David Chen", "Spa Amenities", d(5, 24), 28000, "production", "production",
    { detailSummary: "Branded robes", supplierId: "sup-ningbo", shippingMode: "Ocean LCL", orderType: "Re-order" }),
  p("Sandals Resorts", "David Chen", "Spa Amenities", d(5, 24), 10000, "production", "production",
    { detailSummary: "Amenity kits", supplierId: "sup-yiwu", shippingMode: "Ocean LCL", orderType: "Re-order" }),
  p("Republic Bank", "Sarah Kim", "ATM Wraps", d(5, 28), 22000, "production", "production",
    { detailSummary: "Vinyl branding", supplierId: "sup-shenzhen", shippingMode: "Air" }),
  p("Massy Stores", "Mike Lee", "Eco Tote Run", d(5, 30), 32000, "production", "production",
    { detailSummary: "10k cotton bags", supplierId: "sup-ningbo", shippingMode: "Ocean FCL", orderType: "Re-order" }),

  // ── SHIPPING · Shipment Required (intake) ──
  p("Banks Beer", "Kenji Tanaka", "Festival Kit", d(6, 2), 24000, "shipping", "shipment_required",
    { detailSummary: "Branded tents", supplierId: "sup-freedom", shippingMode: "Ocean FCL" }),
  p("Chefette", "Emily Rodriguez", "Uniform Drop", d(6, 4), 24000, "shipping", "shipment_required",
    { detailSummary: "Crew shirts", supplierId: "sup-ningbo", shippingMode: "Air", orderType: "Re-order" }),
  p("Sagicor", "Carlos Gomez", "Awards Order", d(6, 6), 11500, "shipping", "shipment_required",
    { detailSummary: "Engraved trophies", supplierId: "sup-yiwu", shippingMode: "Air" }),

  // ── SHIPPING · In Transit (assigned to shipments) ──
  // DHL-2456
  p("Banks Beer", "Kenji Tanaka", "Festival Kit", d(6, 2), 12000, "shipping", "shipment_assigned",
    { detailSummary: "Feather banners", supplierId: "sup-admax", shippingMode: "Air", shipmentId: "ship-dhl2456" }),
  p("Goddard Enterprises", "Jenna Park", "Anniversary Gifts", d(5, 20), 9800, "shipping", "shipment_assigned",
    { detailSummary: "Engraved awards", supplierId: "sup-admax", shippingMode: "Air", shipmentId: "ship-dhl2456", priority: "Rush", orderType: "Re-order" }),
  // DHL-2457
  p("ANSA McAL", "Rachel Green", "Report Bundle", d(5, 19), 8500, "shipping", "shipment_assigned",
    { detailSummary: "AGM bundles (air)", supplierId: "sup-admax", shippingMode: "Air", shipmentId: "ship-dhl2457" }),
  // DHL-2458 (delayed)
  p("First Citizens", "Li Wei", "Onboarding Kit", d(5, 27), 13500, "shipping", "shipment_assigned",
    { detailSummary: "Welcome packs", supplierId: "sup-yiwu", shippingMode: "Air", shipmentId: "ship-dhl2458" }),
  p("Chefette", "Emily Rodriguez", "Uniform Drop", d(6, 4), 7000, "shipping", "shipment_assigned",
    { detailSummary: "Polo shirts", supplierId: "sup-yiwu", shippingMode: "Air", shipmentId: "ship-dhl2458" }),
  p("Sagicor", "Carlos Gomez", "Awards Order", d(6, 6), 4500, "shipping", "shipment_assigned",
    { detailSummary: "Lapel pins", supplierId: "sup-yiwu", shippingMode: "Air", shipmentId: "ship-dhl2458" }),
  // FedEx-9912
  p("Goddard Enterprises", "Jenna Park", "Anniversary Gifts", d(5, 20), 6000, "shipping", "shipment_assigned",
    { detailSummary: "Trophy stands", supplierId: "sup-admax", shippingMode: "Air", shipmentId: "ship-fedex9912" }),
  // FCL-125
  p("Banks Beer", "Kenji Tanaka", "Festival Kit", d(6, 2), 22000, "shipping", "shipment_assigned",
    { detailSummary: "Coolers", supplierId: "sup-freedom", shippingMode: "Ocean FCL", shipmentId: "ship-fcl125" }),
  p("Coca-Cola Caribbean", "Priya Sharma", "Beach Tour", d(5, 18), 24000, "shipping", "shipment_assigned",
    { detailSummary: "Cooler bags", supplierId: "sup-freedom", shippingMode: "Ocean FCL", shipmentId: "ship-fcl125" }),
  p("Coca-Cola Caribbean", "Priya Sharma", "Beach Tour", d(5, 18), 14000, "shipping", "shipment_assigned",
    { detailSummary: "Beach shades", supplierId: "sup-freedom", shippingMode: "Ocean FCL", shipmentId: "ship-fcl125" }),
  p("ANSA McAL", "Rachel Green", "Report Bundle", d(5, 19), 17500, "shipping", "shipment_assigned",
    { detailSummary: "AGM bundles", supplierId: "sup-freedom", shippingMode: "Ocean FCL", shipmentId: "ship-fcl125" }),
  p("FLOW Caribbean", "Maria Garcia", "Retail Launch", d(5, 24), 28000, "shipping", "shipment_assigned",
    { detailSummary: "POS displays", supplierId: "sup-freedom", shippingMode: "Ocean FCL", shipmentId: "ship-fcl125" }),
  p("Hilton Caribbean", "Renee Allen", "Resort Refresh", d(5, 30), 18000, "shipping", "shipment_assigned",
    { detailSummary: "Lobby signage", supplierId: "sup-freedom", shippingMode: "Ocean FCL", shipmentId: "ship-fcl125" }),
  // FCL-126
  p("FLOW Caribbean", "Maria Garcia", "Retail Launch", d(5, 24), 19000, "shipping", "shipment_assigned",
    { detailSummary: "Store signage", supplierId: "sup-freedom", shippingMode: "Ocean FCL", shipmentId: "ship-fcl126" }),
  p("GraceKennedy", "Kenji Tanaka", "Trade Show Kit", d(5, 22), 14000, "shipping", "shipment_assigned",
    { detailSummary: "Booth crate", supplierId: "sup-freedom", shippingMode: "Ocean FCL", shipmentId: "ship-fcl126" }),
  p("GraceKennedy", "Kenji Tanaka", "Trade Show Kit", d(5, 22), 8000, "shipping", "shipment_assigned",
    { detailSummary: "Booth giveaways", supplierId: "sup-yiwu", shippingMode: "Ocean FCL", shipmentId: "ship-fcl126" }),
  p("Hilton Caribbean", "Renee Allen", "Resort Refresh", d(5, 30), 16000, "shipping", "shipment_assigned",
    { detailSummary: "Welcome amenity kits", supplierId: "sup-yiwu", shippingMode: "Ocean FCL", shipmentId: "ship-fcl126" }),
  // LCL-088 (customs)
  p("NCB Jamaica", "Sam Jones", "Branch Refresh", d(5, 26), 28000, "shipping", "shipment_assigned",
    { detailSummary: "Branch signage", supplierId: "sup-admax", shippingMode: "Ocean LCL", shipmentId: "ship-lcl088", orderType: "Re-order", tag: "Customs Pending" }),

  // ── FINANCE · Invoice Required (just delivered, shipping refs preserved) ──
  p("Caribbean Airlines", "Anna Petrova", "Inflight Refresh", d(5, 29), 62000, "finance", "invoice_required",
    { detailSummary: "Amenity kits", supplierId: "sup-freedom", shippingMode: "Ocean FCL", shipmentId: "ship-fcl120" }),
  p("Demerara Distillers", "Evelyn Reed", "Holiday Gift", d(5, 12), 26000, "finance", "invoice_required",
    { detailSummary: "Rum gift boxes", supplierId: "sup-ningbo", shippingMode: "Ocean FCL", shipmentId: "ship-fcl120", orderType: "Re-order" }),
  p("Trinidad Cement", "Maria Garcia", "Safety Campaign", d(5, 8), 21000, "finance", "invoice_required",
    { detailSummary: "Hi-vis gear", supplierId: "sup-ningbo", shippingMode: "Ocean FCL", shipmentId: "ship-fcl120" }),
  p("WIBISCO", "Aisha Khan", "Biscuit Promo", d(5, 6), 18000, "finance", "invoice_required",
    { detailSummary: "POS shelf strips", supplierId: "sup-shenzhen", shippingMode: "Ocean LCL", shipmentId: "ship-fcl120" }),
  p("Solo Beverages", "Devon Ali", "Summer SKUs", d(5, 4), 14500, "finance", "invoice_required",
    { detailSummary: "Custom labels", supplierId: "sup-shenzhen", shippingMode: "Air", shipmentId: "ship-dhl2401" }),

  // ── FINANCE · Invoiced ──
  p("Sandals Resorts", "David Chen", "Spa Amenities", d(5, 25), 28000, "finance", "invoiced",
    { detailSummary: "Branded robes", supplierId: "sup-ningbo", shippingMode: "Ocean LCL", shipmentId: "ship-fcl120", orderType: "Re-order" }),
  p("Sandals Resorts", "David Chen", "Spa Amenities", d(5, 25), 10000, "finance", "invoiced",
    { detailSummary: "Amenity kits", supplierId: "sup-yiwu", shippingMode: "Ocean LCL", shipmentId: "ship-fcl120", orderType: "Re-order" }),
  p("Digicel", "Anya Sharma", "Retail Refresh", d(5, 28), 26000, "finance", "invoiced",
    { detailSummary: "Counter displays", supplierId: "sup-shenzhen", shippingMode: "Ocean FCL", shipmentId: "ship-fcl120" }),
  p("Digicel", "Anya Sharma", "Retail Refresh", d(5, 28), 20000, "finance", "invoiced",
    { detailSummary: "Crew polos", supplierId: "sup-ningbo", shippingMode: "Ocean FCL", shipmentId: "ship-fcl120" }),
  p("BTMI", "Melissa McGeary", "Trade Show", d(5, 30), 14000, "finance", "invoiced",
    { detailSummary: "Brochure binders", supplierId: "sup-shenzhen", shippingMode: "Air", shipmentId: "ship-dhl2401", orderType: "Re-order" }),
  p("BTMI", "Melissa McGeary", "Trade Show", d(5, 30), 14000, "finance", "invoiced",
    { detailSummary: "Cotton totes", supplierId: "sup-ningbo", shippingMode: "Air", shipmentId: "ship-dhl2401", orderType: "Re-order" }),
  p("Republic Bank", "Sarah Kim", "ATM Wraps", d(6, 2), 22000, "finance", "invoiced",
    { detailSummary: "Vinyl wraps", supplierId: "sup-shenzhen", shippingMode: "Air", shipmentId: "ship-dhl2401" }),

  // ── FINANCE · Paid ──
  p("Coca-Cola Caribbean", "Priya Sharma", "Summer Activation", d(5, 5), 24000, "finance", "paid",
    { detailSummary: "Branded coolers", supplierId: "sup-freedom", shippingMode: "Ocean FCL", shipmentId: "ship-fcl120" }),
  p("Coca-Cola Caribbean", "Priya Sharma", "Summer Activation", d(5, 5), 14000, "finance", "paid",
    { detailSummary: "Beach shades", supplierId: "sup-freedom", shippingMode: "Ocean FCL", shipmentId: "ship-fcl120" }),
  p("ANSA McAL", "Rachel Green", "Report Bundle", d(5, 3), 17500, "finance", "paid",
    { detailSummary: "AGM bundles", supplierId: "sup-freedom", shippingMode: "Air", shipmentId: "ship-dhl2401" }),
  p("GraceKennedy", "Kenji Tanaka", "Trade Show Kit", d(5, 7), 14000, "finance", "paid",
    { detailSummary: "Booth crate", supplierId: "sup-shenzhen", shippingMode: "Ocean LCL", shipmentId: "ship-fcl120" }),
  p("GraceKennedy", "Kenji Tanaka", "Trade Show Kit", d(5, 7), 8000, "finance", "paid",
    { detailSummary: "Booth giveaways", supplierId: "sup-yiwu", shippingMode: "Ocean LCL", shipmentId: "ship-fcl120" }),
  p("Demerara Distillers", "Evelyn Reed", "Holiday Gift", d(5, 1), 26000, "finance", "paid",
    { detailSummary: "Rum gift boxes", supplierId: "sup-ningbo", shippingMode: "Ocean FCL", shipmentId: "ship-fcl120", orderType: "Re-order" }),
];

// ─────────── Shipments ───────────
// Codes are now PREFIX-number canonical strings (uppercase prefix, single
// hyphen). Air shipments embed the carrier in the prefix (DHL-…, FEDEX-…);
// ocean shipments use FCL-/LCL- prefixes. Old `Ocean FCL` / `Ocean LCL`
// modes collapse to `Ocean` — the container type lives in the code prefix.
type LegacyShipmentMode = ShippingMode | "Ocean FCL" | "Ocean LCL";
interface ShipmentSeed extends Omit<Shipment, "mode" | "code"> {
  mode: LegacyShipmentMode;
  code: string;
}
const SHIPMENTS_SEED: ShipmentSeed[] = [
  { id: "ship-dhl2456",   code: "DHL-4523891076",   mode: "Air",       carrier: "DHL",   supplierId: "sup-admax",    etd: d(4, 28), eta: d(5, 3),  status: "In Transit" },
  { id: "ship-dhl2457",   code: "DHL-4523918842",   mode: "Air",       carrier: "DHL",   supplierId: "sup-admax",    etd: d(4, 30), eta: d(5, 5),  status: "In Transit" },
  { id: "ship-dhl2458",   code: "DHL-4524027193",   mode: "Air",       carrier: "DHL",   supplierId: "sup-yiwu",     etd: d(5, 2),  eta: d(5, 7),  status: "Delayed" },
  { id: "ship-fedex9912", code: "FEDEX-7728340195", mode: "Air",       carrier: "FedEx", supplierId: "sup-admax",    etd: d(5, 5),  eta: d(5, 9),  status: "In Transit" },
  { id: "ship-fcl125",    code: "FCL-125",          mode: "Ocean FCL",                   supplierId: "sup-freedom",  etd: d(4, 12), eta: d(5, 18), status: "In Transit" },
  { id: "ship-fcl126",    code: "FCL-126",          mode: "Ocean FCL",                   supplierId: "sup-freedom",  etd: d(4, 20), eta: d(5, 28), status: "In Transit" },
  { id: "ship-lcl088",    code: "LCL-088",          mode: "Ocean LCL",                   supplierId: "sup-shenzhen", etd: d(4, 25), eta: d(6, 5),  status: "Customs" },
  { id: "ship-fcl120",    code: "FCL-120",          mode: "Ocean FCL",                   supplierId: "sup-freedom",  etd: d(3, 15), eta: d(4, 18), status: "Delivered" },
  { id: "ship-dhl2401",   code: "DHL-4521776304",   mode: "Air",       carrier: "DHL",   supplierId: "sup-admax",    etd: d(4, 5),  eta: d(4, 10), status: "Delivered" },
];
export const SHIPMENTS: Shipment[] = SHIPMENTS_SEED.map((s) => ({
  ...s,
  mode: migrateMode(s.mode) ?? "Ocean",
}));


// ─────────── Reference numbers + line items (deterministic enrichment) ───────────
const ITEM_POOL: { description: string; qtyMin: number; qtyMax: number }[] = [
  { description: "Branded Pens",            qtyMin: 500,  qtyMax: 5000 },
  { description: "Polo Shirts (embroidered)", qtyMin: 100, qtyMax: 800 },
  { description: "T-Shirts (printed)",      qtyMin: 200,  qtyMax: 2000 },
  { description: "Water Bottles 750ml",     qtyMin: 100,  qtyMax: 1500 },
  { description: "Cotton Tote Bags",        qtyMin: 200,  qtyMax: 3000 },
  { description: "USB Drives 16GB",         qtyMin: 100,  qtyMax: 1000 },
  { description: "Notebooks A5",            qtyMin: 200,  qtyMax: 2500 },
  { description: "Lanyards",                qtyMin: 200,  qtyMax: 3000 },
  { description: "Vinyl Banners 3x1m",      qtyMin: 10,   qtyMax: 80 },
  { description: "Feather Flags 2m",        qtyMin: 10,   qtyMax: 60 },
  { description: "Branded Coolers 60L",     qtyMin: 50,   qtyMax: 300 },
  { description: "Beach Umbrellas",         qtyMin: 30,   qtyMax: 200 },
  { description: "Stainless Tumblers",      qtyMin: 200,  qtyMax: 2000 },
  { description: "Baseball Caps",           qtyMin: 200,  qtyMax: 2000 },
  { description: "Drawstring Bags",         qtyMin: 300,  qtyMax: 3000 },
  { description: "Pop-Up Tents 3x3m",       qtyMin: 5,    qtyMax: 50 },
  { description: "Table Covers (printed)",  qtyMin: 20,   qtyMax: 150 },
  { description: "Pull-up Banners",         qtyMin: 4,    qtyMax: 30 },
  { description: "Backdrop Walls 3x2m",     qtyMin: 1,    qtyMax: 10 },
  { description: "Branded Stage Skirt",     qtyMin: 1,    qtyMax: 8 },
  { description: "Keychains (metal)",       qtyMin: 300,  qtyMax: 3000 },
  { description: "Sticker Sheets A4",       qtyMin: 500,  qtyMax: 5000 },
];

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
  return h >>> 0;
}
function pickItems(seed: string): LineItem[] {
  const h = hashStr(seed);
  const count = 3 + (h % 3); // 3, 4, or 5
  const items: LineItem[] = [];
  const used = new Set<number>();
  for (let i = 0; i < count; i++) {
    let idx = (h + i * 2654435761) % ITEM_POOL.length;
    while (used.has(idx)) idx = (idx + 1) % ITEM_POOL.length;
    used.add(idx);
    const tmpl = ITEM_POOL[idx];
    const qSeed = hashStr(seed + ":" + i);
    const range = tmpl.qtyMax - tmpl.qtyMin;
    const step = tmpl.qtyMin >= 100 ? 50 : 5;
    const raw = tmpl.qtyMin + (qSeed % (range + 1));
    const qty = Math.max(tmpl.qtyMin, Math.round(raw / step) * step);
    items.push({ qty, description: tmpl.description });
  }
  return items;
}

// Assign quote / PO / invoice numbers deterministically.
let _qSeq = 2040, _poSeq = 1080, _invSeq = 1040;
const STAGE_ORDER: StageId[] = [
  "proposal", "quote", "confirming",
  "design", "proof",
  "purchasing", "production",
  "shipment_required", "shipment_assigned",
  "invoice_required", "invoiced", "paid", "archive",
];
function reachedStage(p: Project, gate: StageId): boolean {
  if (p.stage === "archive") {
    // For archived sales projects: only got a quote if they reached quote/confirming before archive,
    // which we approximate with: archive WITHOUT "Lost"/"Other" tag means they at least got a quote.
    if (gate === "quote") return p.tag === "Cold";
    return false;
  }
  return STAGE_ORDER.indexOf(p.stage) >= STAGE_ORDER.indexOf(gate);
}

for (const proj of PROJECTS) {
  if (reachedStage(proj, "quote")) {
    proj.quoteNumber = `Q-${_qSeq++}`;
  }
  if (reachedStage(proj, "purchasing")) {
    proj.poNumber = `PO-${_poSeq++}`;
    proj.lineItems = pickItems(proj.id);
  }
  if (reachedStage(proj, "invoice_required")) {
    proj.invoiceNumber = `INV-${_invSeq++}`;
  }
}

// ─────────── Sales-label → new shipping model migration ───────────
// Convert legacy `salesShippingLabel` strings into canonical { shippingMode,
// trackingRef } pairs per the simplification spec:
//   Ocean FCL  → mode "Ocean", tracking blank (prefix-only hint = FCL)
//   Ocean LCL  → mode "Ocean", tracking blank (prefix-only hint = LCL)
//   DHL/FedEx  → mode "Air",   tracking blank (prefix-only hint = DHL/FEDEX)
//   Courier    → mode "Air",   tracking blank
//   Mixed      → mode unset    (missing-data flag)
//   Local      → mode "Local", no tracking
for (const proj of PROJECTS) {
  // 1. Inherit trackingRef from the assigned shipment when present.
  if (proj.shipmentId && !proj.trackingRef) {
    const sh = SHIPMENTS.find((s) => s.id === proj.shipmentId);
    if (sh) proj.trackingRef = sh.code;
  }
  // 2. Collapse sales-label hints (we drop the field afterward).
  const lbl = proj.salesShippingLabel;
  if (lbl) {
    if (lbl === "Ocean FCL" || lbl === "Ocean LCL") {
      proj.shippingMode = proj.shippingMode ?? "Ocean";
    } else if (lbl === "DHL" || lbl === "FedEx" || lbl === "Courier") {
      proj.shippingMode = "Air";
    } else if (lbl === "Mixed") {
      proj.shippingMode = undefined;
    } else if (lbl === "Local") {
      proj.shippingMode = "Local";
      proj.trackingRef = undefined;
    }
  }
  // 3. Local always has no tracking.
  if (proj.shippingMode === "Local") proj.trackingRef = undefined;
  // 4. Drop the now-redundant sales label.
  proj.salesShippingLabel = undefined;
}

// Intentional placeholders — exercise the empty-state UI ("PO-", "Q-", "—")
// so the team can see how unassigned references read across the app.
function find(customer: string, projectName: string, detail?: string): Project | undefined {
  return PROJECTS.find((p) =>
    p.customer === customer && p.projectName === projectName &&
    (detail === undefined || p.detailSummary === detail),
  );
}

// A couple of Sales / Quote cards still missing a quote number
const noQ1 = find("GraceKennedy", "Trade Show Kit", "Booth giveaways");
if (noQ1) noQ1.quoteNumber = undefined;
const noQ2 = find("Caribbean Airlines", "Inflight Refresh", "Branded amenity kits");
if (noQ2) noQ2.quoteNumber = undefined;

// A Production card with no PO yet (still in pre-production, awaiting paperwork)
const noPO = find("Solo Beverages", "Summer SKUs", "Custom labels");
// A Purchasing card with no PO yet (still being prepared, awaiting paperwork)
const noPO = find("Solo Beverages", "Summer SKUs", "Custom labels");
if (noPO && noPO.pipeline === "purchasing") noPO.poNumber = undefined;

// A Purchasing card with no shipping mode decided yet
const noMode = find("WIBISCO", "Biscuit Promo", "POS shelf strips");
if (noMode && noMode.pipeline === "purchasing") noMode.shippingMode = undefined;

// A Purchasing card missing both
const noBoth = find("Bermudez Group", "Snack Launch", "POS shelf strips");
if (noBoth && noBoth.pipeline === "purchasing") {
  noBoth.poNumber = undefined;
  noBoth.shippingMode = undefined;
}

// ─────────── Payment-terms migration on existing seed projects ───────────
// All projects default to "Net 30" inherited; finance-stage projects get
// sensible default invoice timestamps so the aging UI has data to show.
const _NOW = new Date();
const _FIN_AGE: Record<string, number> = {
  invoice_required: 5,
  invoiced: 12,
  paid: 30,
};
for (let i = 0; i < PROJECTS.length; i++) {
  const proj = PROJECTS[i];
  proj.paymentTerms = proj.paymentTerms ?? "Net 30";
  proj.paymentTermsInherited = true;
  if (proj.pipeline === "finance") {
    if (proj.stage === "invoice_required" && !proj.invoiceRequiredEnteredAt) {
      const offset = (seededOffset(i + 1, 1, 22) || 5);
      proj.invoiceRequiredEnteredAt = new Date(_NOW.getTime() - offset * 86400000);
    }
    if ((proj.stage === "invoiced" || proj.stage === "paid") && !proj.invoiceIssuedDate) {
      const baseOffset = _FIN_AGE[proj.stage] ?? 10;
      const jitter = seededOffset(i + 100, -4, 25);
      const days = Math.max(1, baseOffset + jitter);
      proj.invoiceIssuedDate = new Date(_NOW.getTime() - days * 86400000);
      proj.invoiceIssuedDateAssumed = true;
    }
  }
}

// ─────────── Lookups ───────────
export const getProject = (id: string) => PROJECTS.find((x) => x.id === id);
export const getSupplier = (id?: string) => (id ? SUPPLIERS.find((x) => x.id === id) : undefined);
export const getShipment = (id?: string) => (id ? SHIPMENTS.find((x) => x.id === id) : undefined);
export const getProjectsForSupplier = (supplierId: string) => PROJECTS.filter((p) => p.supplierId === supplierId);
export const getProjectsForShipment = (shipmentId: string) => PROJECTS.filter((p) => p.shipmentId === shipmentId);

// All distinct project names (used by the Project filter)
export const distinctProjectNames = (): string[] =>
  Array.from(new Set(PROJECTS.map((p) => p.projectName))).sort();

// Master customer list — derived from existing projects (real app would be its own module)
export const distinctCustomers = (): string[] =>
  Array.from(new Set(PROJECTS.map((p) => p.customer))).sort();

export function buildCard(project: Project): PipelineCard {
  return {
    id: project.id,
    project,
    supplier: getSupplier(project.supplierId),
    shipment: getShipment(project.shipmentId),
    pipeline: project.pipeline,
    stage: project.stage,
    deadline: project.deadline,
    deadlineDate: project.deadlineDate,
    shippingMode: project.shippingMode,
    orderType: project.orderType,
    priority: project.priority,
    tag: project.tag,
  };
}

export function pipelineCounts(): Record<PipelineId, number> {
  return {
    sales: PROJECTS.filter((p) => p.pipeline === "sales").length,
    design: PROJECTS.filter((p) => p.pipeline === "design").length,
    operations: PROJECTS.filter((p) => p.pipeline === "operations").length,
    shipping: PROJECTS.filter((p) => p.pipeline === "shipping").length,
    finance: PROJECTS.filter((p) => p.pipeline === "finance").length,
  };
}
