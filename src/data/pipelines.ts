// ─────────── Flat project data model ───────────
// Every card is one Project: customer + project name + (optional) detail summary,
// one supplier max, one shipping mode max, line items.
// Shared "project name" across multiple cards is just a naming convention.

export type PipelineId = "sales" | "operations" | "shipping" | "finance";

export type StageId =
  // sales
  | "proposal" | "quote" | "confirming" | "archive"
  // operations (production)
  | "preproduction" | "in_production"
  // shipping (virtual stage used for routing only — UI groups by Air/Ocean + shipment code)
  | "shipment_required" | "shipment_assigned" | "shipment_delivered"
  // finance
  | "invoice_required" | "invoiced" | "paid";

export type ShippingMode = "Air" | "Ocean LCL" | "Ocean FCL";
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
    stages: [
      { id: "proposal", title: "Proposal" },
      { id: "quote", title: "Quote" },
      { id: "confirming", title: "Confirming" },
      { id: "archive", title: "Archive" },
    ],
  },
  {
    id: "operations",
    title: "Production",
    stages: [
      { id: "preproduction", title: "Pre-Production" },
      { id: "in_production", title: "In Production" },
    ],
  },
  {
    id: "shipping",
    title: "Shipping",
    stages: [
      { id: "shipment_required", title: "Shipment Required" },
      { id: "shipment_assigned", title: "In Transit" },
      { id: "shipment_delivered", title: "Delivered" },
    ],
  },
  {
    id: "finance",
    title: "Finance",
    stages: [
      { id: "invoice_required", title: "Invoice Required" },
      { id: "invoiced", title: "Invoiced" },
      { id: "paid", title: "Paid" },
    ],
  },
];

export const STAGE_ACCENT: Record<StageId, string> = {
  proposal: "indigo", quote: "amber", confirming: "emerald", archive: "slate",
  preproduction: "violet", in_production: "orange",
  shipment_required: "amber", shipment_assigned: "sky", shipment_delivered: "emerald",
  invoice_required: "rose", invoiced: "amber", paid: "emerald",
};

// ─────────── Suppliers ───────────
export interface Supplier {
  id: string;
  name: string;
  country: string;
  defaultShippingMode: ShippingMode;
  contact: string;
  notes?: string;
}

export const SUPPLIERS: Supplier[] = [
  { id: "sup-freedom", name: "Freedom Gifts", country: "China", defaultShippingMode: "Ocean FCL", contact: "Lily Wang", notes: "Reliable for promo merch; 30-day lead time." },
  { id: "sup-admax", name: "Admax", country: "China", defaultShippingMode: "Air", contact: "Jason Liu", notes: "Best for banners, flags, large format." },
  { id: "sup-yiwu", name: "Yiwu Star", country: "China", defaultShippingMode: "Ocean LCL", contact: "Mei Chen", notes: "Variety merchandise; budget-friendly." },
  { id: "sup-shenzhen", name: "Shenzhen Print Co", country: "China", defaultShippingMode: "Ocean LCL", contact: "David Park", notes: "Print specialist; signage & POS." },
  { id: "sup-ningbo", name: "Ningbo Textile", country: "China", defaultShippingMode: "Ocean FCL", contact: "Sara Wu", notes: "Textile orders, uniforms, totes." },
];

// ─────────── Project (the only entity now) ───────────
export interface LineItem {
  qty: number;
  description: string;
}

/**
 * Sales-only display hints. Once a project moves into Production, these are
 * dropped in favour of the canonical `supplierId` + `shippingMode` fields,
 * which downstream pipelines use for everything (PO, shipment grouping, etc.).
 */
export type SupplierLabelHint = "TBD" | "Various";
export type SalesShippingLabel =
  | "Ocean FCL" | "Ocean LCL" | "DHL" | "FedEx" | "Courier" | "Mixed";

export interface Project {
  id: string;
  customer: string;
  pointPerson: string;
  projectName: string;
  detailSummary?: string;       // optional in Sales/Proposal; required from Confirming on
  supplierId?: string;          // required from Confirming on
  supplierLabel?: SupplierLabelHint; // Sales-only: shown when supplierId not yet locked
  shippingMode?: ShippingMode;  // required from Confirming on
  salesShippingLabel?: SalesShippingLabel; // Sales-only display string
  shipmentId?: string;          // assigned in Shipping
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
}

export type AirCarrier = "DHL" | "FedEx";

export interface Shipment {
  id: string;
  /**
   * Code body only — for ocean: FCL-125 / LCL-088. For air: 10-digit tracking
   * number (no carrier prefix). The carrier field carries the prefix.
   */
  code: string;
  mode: ShippingMode;
  carrier?: AirCarrier; // required when mode === "Air"
  supplierId: string;
  etd: Date;
  eta: Date;
  status: "Booked" | "In Transit" | "Customs" | "Delayed" | "Delivered";
}

/**
 * Canonical shipping label used everywhere on cards & detail views.
 *  Ocean FCL · FCL-125
 *  Ocean LCL · LCL-088
 *  DHL · 4523891076
 *  FedEx · 7728340195
 *
 * If the code is missing, the right side becomes a dim placeholder
 * (e.g. "FCL-", "LCL-", "DHL · ", "FedEx · ", "— · —").
 */
export function formatShippingLabel(
  mode: ShippingMode | undefined,
  code: string | undefined,
  carrier?: AirCarrier,
): { text: string; placeholder: boolean } {
  if (!mode) return { text: "— · —", placeholder: true };
  if (mode === "Ocean FCL") return code
    ? { text: `Ocean FCL · ${code}`, placeholder: false }
    : { text: "Ocean FCL · FCL-", placeholder: true };
  if (mode === "Ocean LCL") return code
    ? { text: `Ocean LCL · ${code}`, placeholder: false }
    : { text: "Ocean LCL · LCL-", placeholder: true };
  // Air
  const c = carrier ?? "DHL";
  return code
    ? { text: `${c} · ${code}`, placeholder: false }
    : { text: `${c} · `, placeholder: true };
}

export function formatShipmentTitle(s: Shipment): string {
  if (s.mode === "Air") return `${s.carrier ?? "DHL"} · ${s.code}`;
  if (s.mode === "Ocean FCL") return `Ocean FCL · ${s.code}`;
  return `Ocean LCL · ${s.code}`;
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
  shippingMode?: ShippingMode;
  salesShippingLabel?: SalesShippingLabel;
  shipmentId?: string;
  orderType?: OrderType;
  priority?: Priority;
  tag?: CardTag;
}

let _seq = 0;
const p = (
  customer: string, pointPerson: string, projectName: string,
  date: Date, value: number, pipeline: PipelineId, stage: StageId,
  opts: ProjOpts = {},
): Project => ({
  id: `prj-${++_seq}`,
  customer, pointPerson, projectName,
  detailSummary: opts.detailSummary,
  supplierId: opts.supplierId,
  supplierLabel: opts.supplierLabel,
  shippingMode: opts.shippingMode,
  salesShippingLabel: opts.salesShippingLabel,
  shipmentId: opts.shipmentId,
  pipeline, stage,
  deadline: fmt(date), deadlineDate: date,
  value,
  orderType: opts.orderType ?? "New",
  priority: opts.priority ?? "Standard",
  tag: opts.tag,
});

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

  // ── SALES · Confirming (supplier + shipping + detail required) ──
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
  p("Bermudez Group", "Lucia Ramos", "Snack Launch", d(5, 14), 22000, "operations", "preproduction",
    { detailSummary: "Acrylic display stands", supplierId: "sup-shenzhen", shippingMode: "Ocean LCL", priority: "Rush" }),
  p("Bermudez Group", "Lucia Ramos", "Snack Launch", d(5, 14), 12000, "operations", "preproduction",
    { detailSummary: "POS shelf strips", supplierId: "sup-shenzhen", shippingMode: "Ocean LCL", priority: "Rush" }),
  p("Carib Brewery", "Mark Yeung", "Stadium Activation", d(5, 19), 32000, "operations", "preproduction",
    { detailSummary: "Branded coolers", supplierId: "sup-freedom", shippingMode: "Ocean FCL" }),
  p("Carib Brewery", "Mark Yeung", "Stadium Activation", d(5, 19), 20000, "operations", "preproduction",
    { detailSummary: "Stadium banners", supplierId: "sup-admax", shippingMode: "Air" }),
  p("WIBISCO", "Aisha Khan", "Biscuit Promo", d(5, 22), 18000, "operations", "preproduction",
    { detailSummary: "POS shelf strips", supplierId: "sup-shenzhen", shippingMode: "Ocean LCL" }),
  p("Solo Beverages", "Devon Ali", "Summer SKUs", d(5, 23), 14500, "operations", "preproduction",
    { detailSummary: "Custom labels", supplierId: "sup-shenzhen", shippingMode: "Air" }),

  // ── PRODUCTION · In Production ──
  p("BTMI", "Melissa McGeary", "Trade Show", d(5, 17), 14000, "operations", "in_production",
    { detailSummary: "Brochure binders", supplierId: "sup-shenzhen", shippingMode: "Air", priority: "Rush", orderType: "Re-order" }),
  p("BTMI", "Melissa McGeary", "Trade Show", d(5, 17), 14000, "operations", "in_production",
    { detailSummary: "Cotton tote bags", supplierId: "sup-ningbo", shippingMode: "Air", priority: "Rush", orderType: "Re-order" }),
  p("Digicel", "Anya Sharma", "Retail Refresh", d(5, 21), 26000, "operations", "in_production",
    { detailSummary: "Counter displays", supplierId: "sup-shenzhen", shippingMode: "Ocean FCL" }),
  p("Digicel", "Anya Sharma", "Retail Refresh", d(5, 21), 20000, "operations", "in_production",
    { detailSummary: "Crew polos", supplierId: "sup-ningbo", shippingMode: "Ocean FCL" }),
  p("Sandals Resorts", "David Chen", "Spa Amenities", d(5, 24), 28000, "operations", "in_production",
    { detailSummary: "Branded robes", supplierId: "sup-ningbo", shippingMode: "Ocean LCL", orderType: "Re-order" }),
  p("Sandals Resorts", "David Chen", "Spa Amenities", d(5, 24), 10000, "operations", "in_production",
    { detailSummary: "Amenity kits", supplierId: "sup-yiwu", shippingMode: "Ocean LCL", orderType: "Re-order" }),
  p("Republic Bank", "Sarah Kim", "ATM Wraps", d(5, 28), 22000, "operations", "in_production",
    { detailSummary: "Vinyl branding", supplierId: "sup-shenzhen", shippingMode: "Air" }),
  p("Massy Stores", "Mike Lee", "Eco Tote Run", d(5, 30), 32000, "operations", "in_production",
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
// Air codes are bare 10-digit tracking numbers; the carrier lives in `carrier`.
// Ocean codes are FCL-XXX / LCL-XXX (3 digits).
export const SHIPMENTS: Shipment[] = [
  { id: "ship-dhl2456",   code: "4523891076", mode: "Air",       carrier: "DHL",   supplierId: "sup-admax",    etd: d(4, 28), eta: d(5, 3),  status: "In Transit" },
  { id: "ship-dhl2457",   code: "4523918842", mode: "Air",       carrier: "DHL",   supplierId: "sup-admax",    etd: d(4, 30), eta: d(5, 5),  status: "In Transit" },
  { id: "ship-dhl2458",   code: "4524027193", mode: "Air",       carrier: "DHL",   supplierId: "sup-yiwu",     etd: d(5, 2),  eta: d(5, 7),  status: "Delayed" },
  { id: "ship-fedex9912", code: "7728340195", mode: "Air",       carrier: "FedEx", supplierId: "sup-admax",    etd: d(5, 5),  eta: d(5, 9),  status: "In Transit" },
  { id: "ship-fcl125",    code: "FCL-125",    mode: "Ocean FCL",                   supplierId: "sup-freedom",  etd: d(4, 12), eta: d(5, 18), status: "In Transit" },
  { id: "ship-fcl126",    code: "FCL-126",    mode: "Ocean FCL",                   supplierId: "sup-freedom",  etd: d(4, 20), eta: d(5, 28), status: "In Transit" },
  { id: "ship-lcl088",    code: "LCL-088",    mode: "Ocean LCL",                   supplierId: "sup-shenzhen", etd: d(4, 25), eta: d(6, 5),  status: "Customs" },
  { id: "ship-fcl120",    code: "FCL-120",    mode: "Ocean FCL",                   supplierId: "sup-freedom",  etd: d(3, 15), eta: d(4, 18), status: "Delivered" },
  { id: "ship-dhl2401",   code: "4521776304", mode: "Air",       carrier: "DHL",   supplierId: "sup-admax",    etd: d(4, 5),  eta: d(4, 10), status: "Delivered" },
];


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
  "proposal", "quote", "confirming", "preproduction", "in_production",
  "shipment_required", "shipment_assigned", "shipment_delivered",
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
  if (reachedStage(proj, "preproduction")) {
    proj.poNumber = `PO-${_poSeq++}`;
    proj.lineItems = pickItems(proj.id);
  }
  if (reachedStage(proj, "invoice_required")) {
    proj.invoiceNumber = `INV-${_invSeq++}`;
  }
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
if (noPO && noPO.pipeline === "operations") noPO.poNumber = undefined;

// A Production card with no shipping mode decided yet
const noMode = find("WIBISCO", "Biscuit Promo", "POS shelf strips");
if (noMode && noMode.pipeline === "operations") noMode.shippingMode = undefined;

// A Production card missing both
const noBoth = find("Bermudez Group", "Snack Launch", "POS shelf strips");
if (noBoth && noBoth.pipeline === "operations") {
  noBoth.poNumber = undefined;
  noBoth.shippingMode = undefined;
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
    operations: PROJECTS.filter((p) => p.pipeline === "operations").length,
    shipping: PROJECTS.filter((p) => p.pipeline === "shipping").length,
    finance: PROJECTS.filter((p) => p.pipeline === "finance").length,
  };
}
