export type PipelineId = "sales" | "operations" | "shipping" | "finance";

export type StageId =
  // sales
  | "proposal" | "quote" | "confirming" | "archive"
  // operations
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
    // Shipping doesn't render as stages — these exist only for routing/state.
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

// ─────────── Master & Sub Projects ───────────
export interface LineItem {
  qty: number;
  description: string;
}

export interface MasterProject {
  id: string;
  customer: string;
  pointPerson: string;
  projectName: string;
  summary: string;
  deadline: string;
  deadlineDate: Date;
  value: number;
  pipeline: PipelineId;
  stage: StageId;
  shippingMode: ShippingMode;
  orderType: OrderType;
  priority: Priority;
  tag?: CardTag;
}

export interface SubProject {
  id: string;
  masterId: string;
  itemName: string;
  summary: string;
  supplierId: string;
  shippingMode: ShippingMode;
  shipmentId?: string;
  pipeline: PipelineId;
  stage: StageId;
  deadline: string;
  deadlineDate: Date;
  value: number;
  priority: Priority;
  orderType: OrderType;
  tag?: CardTag;
  poNumber?: string;
  lineItems?: LineItem[];
}

export interface Shipment {
  id: string;
  code: string;
  mode: ShippingMode;
  supplierId: string;
  etd: Date;
  eta: Date;
  status: "Booked" | "In Transit" | "Customs" | "Delayed" | "Delivered";
}

// ─────────── Unified pipeline card ───────────
export interface PipelineCard {
  kind: "master" | "sub";
  id: string;
  master: MasterProject;
  sub?: SubProject;
  supplier?: Supplier;
  shipment?: Shipment;
  pipeline: PipelineId;
  stage: StageId;
  deadline: string;
  deadlineDate: Date;
  shippingMode: ShippingMode;
  orderType: OrderType;
  priority: Priority;
  tag?: CardTag;
}

// ─────────── Helpers ───────────
const d = (m: number, day: number) => new Date(2026, m - 1, day);
const fmt = (date: Date) =>
  `${date.getDate()} ${date.toLocaleString("en-US", { month: "short" })}`;

const m = (
  id: string, customer: string, pointPerson: string, projectName: string, summary: string,
  date: Date, value: number, pipeline: PipelineId, stage: StageId,
  shippingMode: ShippingMode = "Air", orderType: OrderType = "New", priority: Priority = "Standard",
  tag?: CardTag,
): MasterProject => ({
  id, customer, pointPerson, projectName, summary,
  deadline: fmt(date), deadlineDate: date, value,
  pipeline, stage, shippingMode, orderType, priority, tag,
});

// ─────────── Master Projects ───────────
export const MASTERS: MasterProject[] = [
  // SALES — masters only (24 total)
  m("m-s1", "BTMI", "Melissa McGeary", "Connect Barbados", "Welcome party premiums", d(5, 16), 18500, "sales", "proposal", "Air", "New", "Rush"),
  m("m-s2", "Digicel", "Anya Sharma", "Summer Activation", "Branded merchandise kits", d(5, 18), 24000, "sales", "proposal", "Ocean LCL"),
  m("m-s3", "Banks Beer", "Kenji Tanaka", "Crop Over 2026", "Festival giveaways", d(5, 22), 41000, "sales", "proposal", "Ocean FCL", "Re-order"),
  m("m-s4", "Sandals Resorts", "David Chen", "Guest Welcome", "Eco-friendly amenity bags", d(5, 10), 32000, "sales", "proposal", "Air", "New", "Rush"),
  m("m-s5", "Republic Bank", "Sarah Kim", "AGM 2026", "Executive gift sets", d(5, 12), 12500, "sales", "proposal"),
  m("m-s6", "Massy Stores", "Mike Lee", "Loyalty Program", "Reusable shopping totes", d(5, 27), 56000, "sales", "proposal", "Ocean FCL", "Re-order"),

  m("m-s7", "Chefette", "Emily Rodriguez", "Drive-Thru Refresh", "Branded uniforms", d(5, 9), 19000, "sales", "quote", "Air", "Re-order", "Rush"),
  m("m-s8", "Sagicor", "Carlos Gomez", "Sales Conference", "Awards & trophies", d(5, 24), 14500, "sales", "quote"),
  m("m-s9", "Coca-Cola Caribbean", "Priya Sharma", "Beach Tour", "Cooler bags & shades", d(5, 13), 38000, "sales", "quote", "Ocean FCL"),
  m("m-s10", "Goddard Enterprises", "Jenna Park", "Anniversary Gifts", "Custom desk awards", d(5, 29), 9800, "sales", "quote"),
  m("m-s11", "ANSA McAL", "Rachel Green", "Shareholder Pack", "Annual report bundle", d(5, 18), 17500, "sales", "quote", "Air"),
  m("m-s12", "GraceKennedy", "Kenji Tanaka", "Trade Show Kit", "Booth giveaways", d(5, 16), 22000, "sales", "quote", "Ocean LCL", "New", "Rush"),

  m("m-s13", "FLOW Caribbean", "Maria Garcia", "Retail Launch", "POS displays", d(5, 20), 47000, "sales", "confirming", "Ocean FCL"),
  m("m-s14", "NCB Jamaica", "Sam Jones", "Branch Refresh", "Signage & stationery", d(5, 17), 28000, "sales", "confirming"),
  m("m-s15", "First Citizens", "Li Wei", "Onboarding Kit", "New hire welcome packs", d(5, 19), 13500, "sales", "confirming", "Air", "Re-order"),
  m("m-s16", "Caribbean Airlines", "Anna Petrova", "Inflight Refresh", "Branded amenity kits", d(5, 21), 62000, "sales", "confirming", "Ocean LCL"),
  m("m-s17", "Demerara Distillers", "Evelyn Reed", "Holiday Gift", "Premium rum boxes", d(5, 26), 26000, "sales", "confirming", "Ocean FCL", "Re-order"),
  m("m-s18", "Trinidad Cement", "Maria Garcia", "Safety Campaign", "Hi-vis branded gear", d(5, 25), 21000, "sales", "confirming"),

  m("m-s19", "PriceSmart", "Omar Hassan", "Membership Drive", "Branded reusables", d(6, 8), 11000, "sales", "archive", "Air", "New", "Standard", "Cold"),
  m("m-s20", "Courts Caribbean", "Isabelle Dubois", "Storefront Kit", "Window decals", d(6, 12), 8500, "sales", "archive", "Ocean LCL", "New", "Standard", "Cold"),
  m("m-s21", "Lucozade Caribbean", "Lena Petrova", "Sports Sponsorship", "Athlete kits", d(6, 15), 15000, "sales", "archive", "Air", "Re-order", "Standard", "Cold"),
  m("m-s22", "KFC Barbados", "Javier Rodriguez", "Crew Apparel", "Uniform refresh", d(5, 30), 0, "sales", "archive", "Air", "New", "Standard", "Lost"),
  m("m-s23", "Subway TT", "Tom Becker", "Loyalty Cards", "Branded card stock", d(6, 5), 0, "sales", "archive", "Air", "New", "Standard", "Lost"),
  m("m-s24", "Burger King JM", "Hana Yusuf", "Promo Cups", "Limited edition cups", d(6, 8), 0, "sales", "archive", "Air", "New", "Standard", "Other"),

  // OPERATIONS — Pre-Production + In Production only
  m("m-pr1", "Bermudez Group", "Lucia Ramos", "Snack Launch", "Display stands & POS", d(5, 14), 34000, "operations", "preproduction", "Ocean LCL", "New", "Rush"),
  m("m-pr2", "Carib Brewery", "Mark Yeung", "Stadium Activation", "Coolers + banners", d(5, 19), 52000, "operations", "preproduction", "Ocean FCL"),
  m("m-pr3", "WIBISCO", "Aisha Khan", "Biscuit Promo", "POS shelf strips", d(5, 22), 18000, "operations", "preproduction"),
  m("m-pr4", "Solo Beverages", "Devon Ali", "Summer SKUs", "Custom labels", d(5, 23), 14500, "operations", "preproduction", "Air"),
  m("m-pr5", "BTMI", "Melissa McGeary", "Trade Show", "Brochure binders + tote bags", d(5, 17), 28000, "operations", "in_production", "Air", "Re-order", "Rush"),
  m("m-pr6", "Digicel", "Anya Sharma", "Retail Refresh", "Counter displays + uniforms", d(5, 21), 46000, "operations", "in_production", "Ocean FCL"),
  m("m-pr7", "Sandals Resorts", "David Chen", "Spa Amenities", "Branded robes + amenity kits", d(5, 24), 38000, "operations", "in_production", "Ocean LCL", "Re-order"),
  m("m-pr8", "Republic Bank", "Sarah Kim", "ATM Wraps", "Vinyl branding", d(5, 28), 22000, "operations", "in_production"),
  m("m-pr9", "Massy Stores", "Mike Lee", "Eco Tote Run", "10k cotton bags", d(5, 30), 32000, "operations", "in_production", "Ocean FCL", "Re-order"),

  // SHIPPING — masters that have moved past production. Pipeline = "shipping".
  m("m-pr10", "Banks Beer", "Kenji Tanaka", "Festival Kit", "Tents, flags & coolers", d(6, 2), 58000, "shipping", "shipment_assigned", "Ocean FCL"),
  m("m-pr11", "Chefette", "Emily Rodriguez", "Uniform Drop", "Crew shirts", d(6, 4), 24000, "shipping", "shipment_assigned", "Air", "Re-order"),
  m("m-pr12", "Sagicor", "Carlos Gomez", "Awards Order", "Engraved trophies", d(6, 6), 11500, "shipping", "shipment_assigned", "Air"),

  m("m-sh1", "Coca-Cola Caribbean", "Priya Sharma", "Beach Tour", "Cooler bag run + shades", d(5, 18), 38000, "shipping", "shipment_assigned", "Ocean FCL"),
  m("m-sh2", "Goddard Enterprises", "Jenna Park", "Anniversary Gifts", "Award shipment", d(5, 20), 9800, "shipping", "shipment_assigned", "Air", "Re-order", "Rush"),
  m("m-sh3", "ANSA McAL", "Rachel Green", "Report Bundle", "AGM materials", d(5, 19), 17500, "shipping", "shipment_assigned", "Air"),
  m("m-sh4", "GraceKennedy", "Kenji Tanaka", "Trade Show Kit", "Booth crate + giveaways", d(5, 22), 22000, "shipping", "shipment_assigned", "Ocean LCL"),
  m("m-sh5", "FLOW Caribbean", "Maria Garcia", "Retail Launch", "POS displays + signage", d(5, 24), 47000, "shipping", "shipment_assigned", "Ocean FCL"),
  m("m-sh6", "NCB Jamaica", "Sam Jones", "Branch Refresh", "Signage shipment", d(5, 26), 28000, "shipping", "shipment_assigned", "Ocean LCL", "Re-order", "Standard", "Customs Pending"),
  m("m-sh7", "First Citizens", "Li Wei", "Onboarding Kit", "Welcome packs", d(5, 27), 13500, "shipping", "shipment_assigned", "Air"),
  m("m-sh8", "Hilton Caribbean", "Renee Allen", "Resort Refresh", "Lobby signage + welcome kits", d(5, 30), 34000, "shipping", "shipment_assigned", "Ocean FCL"),

  // FINANCE
  m("m-f0a", "Caribbean Airlines", "Anna Petrova", "Inflight Refresh", "Goods delivered — invoice needed", d(5, 29), 62000, "finance", "invoice_required", "Ocean LCL"),
  m("m-f0b", "Demerara Distillers", "Evelyn Reed", "Holiday Gift", "Goods delivered — invoice needed", d(5, 12), 26000, "finance", "invoice_required", "Ocean FCL", "Re-order"),
  m("m-f0c", "Trinidad Cement", "Maria Garcia", "Safety Campaign", "Goods delivered — invoice needed", d(5, 8), 21000, "finance", "invoice_required"),
  m("m-f0d", "WIBISCO", "Aisha Khan", "Biscuit Promo", "Goods delivered — invoice needed", d(5, 6), 18000, "finance", "invoice_required", "Ocean LCL"),
  m("m-f0e", "Solo Beverages", "Devon Ali", "Summer SKUs", "Goods delivered — invoice needed", d(5, 4), 14500, "finance", "invoice_required", "Air"),

  m("m-f1", "Sandals Resorts", "David Chen", "Spa Amenities", "Invoice #4821", d(5, 25), 38000, "finance", "invoiced", "Ocean LCL", "Re-order"),
  m("m-f2", "Digicel", "Anya Sharma", "Retail Refresh", "Invoice #4822", d(5, 28), 46000, "finance", "invoiced", "Ocean FCL"),
  m("m-f3", "BTMI", "Melissa McGeary", "Trade Show", "Invoice #4823", d(5, 30), 28000, "finance", "invoiced", "Air", "Re-order"),
  m("m-f4", "Republic Bank", "Sarah Kim", "ATM Wraps", "Invoice #4824", d(6, 2), 22000, "finance", "invoiced"),
  m("m-f5", "Coca-Cola Caribbean", "Priya Sharma", "Beach Tour", "Paid in full", d(5, 5), 38000, "finance", "paid", "Ocean FCL"),
  m("m-f6", "ANSA McAL", "Rachel Green", "Report Bundle", "Paid in full", d(5, 3), 17500, "finance", "paid", "Air"),
  m("m-f7", "GraceKennedy", "Kenji Tanaka", "Trade Show Kit", "Paid in full", d(5, 7), 22000, "finance", "paid", "Ocean LCL"),
  m("m-f8", "Demerara Distillers", "Evelyn Reed", "Holiday Gift", "Paid in full", d(5, 1), 26000, "finance", "paid", "Ocean FCL", "Re-order"),
];

// ─────────── Shipments ───────────
export const SHIPMENTS: Shipment[] = [
  // Air
  { id: "ship-dhl2456", code: "DHL-2456", mode: "Air", supplierId: "sup-admax", etd: d(4, 28), eta: d(5, 3), status: "In Transit" },
  { id: "ship-dhl2457", code: "DHL-2457", mode: "Air", supplierId: "sup-admax", etd: d(4, 30), eta: d(5, 5), status: "In Transit" },
  { id: "ship-dhl2458", code: "DHL-2458", mode: "Air", supplierId: "sup-yiwu", etd: d(5, 2), eta: d(5, 7), status: "Delayed" },
  { id: "ship-fedex9912", code: "FedEx-9912", mode: "Air", supplierId: "sup-admax", etd: d(5, 5), eta: d(5, 9), status: "In Transit" },
  // Ocean
  { id: "ship-fcl125", code: "FCL-125", mode: "Ocean FCL", supplierId: "sup-freedom", etd: d(4, 12), eta: d(5, 18), status: "In Transit" },
  { id: "ship-fcl126", code: "FCL-126", mode: "Ocean FCL", supplierId: "sup-freedom", etd: d(4, 20), eta: d(5, 28), status: "In Transit" },
  { id: "ship-lcl088", code: "LCL-088", mode: "Ocean LCL", supplierId: "sup-shenzhen", etd: d(4, 25), eta: d(6, 5), status: "Customs" },
  // Delivered (archive)
  { id: "ship-fcl120", code: "FCL-120", mode: "Ocean FCL", supplierId: "sup-freedom", etd: d(3, 15), eta: d(4, 18), status: "Delivered" },
  { id: "ship-dhl2401", code: "DHL-2401", mode: "Air", supplierId: "sup-admax", etd: d(4, 5), eta: d(4, 10), status: "Delivered" },
];

// ─────────── Sub Projects ───────────
const sp = (
  id: string, masterId: string, itemName: string, summary: string,
  supplierId: string, pipeline: PipelineId, stage: StageId,
  shippingMode: ShippingMode, value: number,
  date: Date, opts: { shipmentId?: string; priority?: Priority; orderType?: OrderType; tag?: CardTag } = {},
): SubProject => ({
  id, masterId, itemName, summary, supplierId, pipeline, stage,
  shippingMode, shipmentId: opts.shipmentId, value,
  deadline: fmt(date), deadlineDate: date,
  priority: opts.priority ?? "Standard", orderType: opts.orderType ?? "New",
  tag: opts.tag,
});

export const SUBS: SubProject[] = [
  // ── OPERATIONS · Pre-Production ──
  sp("sub-pr1a", "m-pr1", "Acrylic Display Stands", "Floor units, branded", "sup-shenzhen", "operations", "preproduction", "Ocean LCL", 22000, d(5, 14), { priority: "Rush" }),
  sp("sub-pr1b", "m-pr1", "POS Shelf Strips", "Printed strips x 5000", "sup-shenzhen", "operations", "preproduction", "Ocean LCL", 12000, d(5, 14), { priority: "Rush" }),
  sp("sub-pr2a", "m-pr2", "Branded Coolers", "60L cooler boxes x 200", "sup-freedom", "operations", "preproduction", "Ocean FCL", 32000, d(5, 19)),
  sp("sub-pr2b", "m-pr2", "Stadium Banners", "Vinyl 3x1m x 40", "sup-admax", "operations", "preproduction", "Air", 20000, d(5, 19)),
  sp("sub-pr3a", "m-pr3", "POS Shelf Strips", "Printed strips x 8000", "sup-shenzhen", "operations", "preproduction", "Ocean LCL", 18000, d(5, 22)),
  sp("sub-pr4a", "m-pr4", "Custom Labels", "Die-cut labels x 50k", "sup-shenzhen", "operations", "preproduction", "Air", 14500, d(5, 23)),

  // ── OPERATIONS · In Production ──
  sp("sub-pr5a", "m-pr5", "Brochure Binders", "Branded binders x 500", "sup-shenzhen", "operations", "in_production", "Air", 14000, d(5, 17), { priority: "Rush", orderType: "Re-order" }),
  sp("sub-pr5b", "m-pr5", "Cotton Tote Bags", "Eco totes x 1000", "sup-ningbo", "operations", "in_production", "Air", 14000, d(5, 17), { priority: "Rush", orderType: "Re-order" }),
  sp("sub-pr6a", "m-pr6", "Counter Displays", "Acrylic displays x 80", "sup-shenzhen", "operations", "in_production", "Ocean FCL", 26000, d(5, 21)),
  sp("sub-pr6b", "m-pr6", "Crew Polos", "Embroidered polos x 600", "sup-ningbo", "operations", "in_production", "Ocean FCL", 20000, d(5, 21)),
  sp("sub-pr7a", "m-pr7", "Branded Robes", "Spa robes x 400", "sup-ningbo", "operations", "in_production", "Ocean LCL", 28000, d(5, 24), { orderType: "Re-order" }),
  sp("sub-pr7b", "m-pr7", "Amenity Kits", "Toiletry pouches x 1200", "sup-yiwu", "operations", "in_production", "Ocean LCL", 10000, d(5, 24), { orderType: "Re-order" }),
  sp("sub-pr8a", "m-pr8", "ATM Vinyl Wraps", "Full wraps x 35 units", "sup-shenzhen", "operations", "in_production", "Air", 22000, d(5, 28)),
  sp("sub-pr9a", "m-pr9", "Cotton Tote Bags", "Eco totes x 10000", "sup-ningbo", "operations", "in_production", "Ocean FCL", 32000, d(5, 30), { orderType: "Re-order" }),

  // ── SHIPPING · Shipment Required (intake — awaiting assignment) ──
  sp("sub-int1", "m-pr10", "Tents", "Branded tents 3x3 x 30", "sup-freedom", "shipping", "shipment_required", "Ocean FCL", 24000, d(6, 2)),
  sp("sub-int2", "m-pr11", "Crew Shirts", "Embroidered shirts x 800", "sup-ningbo", "shipping", "shipment_required", "Air", 24000, d(6, 4), { orderType: "Re-order" }),
  sp("sub-int3", "m-pr12", "Engraved Trophies", "Crystal trophies x 60", "sup-yiwu", "shipping", "shipment_required", "Air", 11500, d(6, 6)),

  // ── SHIPPING · Air ──
  // DHL-2456 — 2 sub-projects
  sp("sub-sh-air-1a", "m-pr10", "Feather Banners", "Flags x 80", "sup-admax", "shipping", "shipment_assigned", "Air", 12000, d(6, 2), { shipmentId: "ship-dhl2456" }),
  sp("sub-sh-air-1b", "m-sh2", "Engraved Awards", "Glass awards x 25", "sup-admax", "shipping", "shipment_assigned", "Air", 9800, d(5, 20), { shipmentId: "ship-dhl2456", priority: "Rush", orderType: "Re-order" }),
  // DHL-2457 — 1
  sp("sub-sh-air-2a", "m-sh3", "AGM Bundles (Air)", "Report packs x 200", "sup-admax", "shipping", "shipment_assigned", "Air", 8500, d(5, 19), { shipmentId: "ship-dhl2457" }),
  // DHL-2458 — 3 (delayed)
  sp("sub-sh-air-3a", "m-sh7", "Welcome Packs", "Onboarding kits x 300", "sup-yiwu", "shipping", "shipment_assigned", "Air", 13500, d(5, 27), { shipmentId: "ship-dhl2458" }),
  sp("sub-sh-air-3b", "m-pr11", "Polo Shirts", "Embroidered polos x 200", "sup-yiwu", "shipping", "shipment_assigned", "Air", 7000, d(6, 4), { shipmentId: "ship-dhl2458" }),
  sp("sub-sh-air-3c", "m-pr12", "Lapel Pins", "Branded pins x 500", "sup-yiwu", "shipping", "shipment_assigned", "Air", 4500, d(6, 6), { shipmentId: "ship-dhl2458" }),
  // FedEx-9912 — 1
  sp("sub-sh-air-4a", "m-sh2", "Trophy Stands", "Display stands x 25", "sup-admax", "shipping", "shipment_assigned", "Air", 6000, d(5, 20), { shipmentId: "ship-fedex9912" }),

  // ── SHIPPING · Ocean ──
  // FCL-125 — 6 sub-projects across 4 customers (BTMI, Banks Beer, Sandals, Hilton)
  sp("sub-sh-fcl125-1", "m-pr10", "Coolers", "Branded coolers x 150", "sup-freedom", "shipping", "shipment_assigned", "Ocean FCL", 22000, d(6, 2), { shipmentId: "ship-fcl125" }),
  sp("sub-sh-fcl125-2", "m-sh1", "Cooler Bags", "Insulated bags x 1500", "sup-freedom", "shipping", "shipment_assigned", "Ocean FCL", 24000, d(5, 18), { shipmentId: "ship-fcl125" }),
  sp("sub-sh-fcl125-3", "m-sh1", "Beach Shades", "Pop-up shades x 80", "sup-freedom", "shipping", "shipment_assigned", "Ocean FCL", 14000, d(5, 18), { shipmentId: "ship-fcl125" }),
  sp("sub-sh-fcl125-4", "m-sh3", "AGM Bundles", "Report packs x 800", "sup-freedom", "shipping", "shipment_assigned", "Ocean FCL", 17500, d(5, 19), { shipmentId: "ship-fcl125" }),
  sp("sub-sh-fcl125-5", "m-sh5", "POS Displays", "Floor displays x 60", "sup-freedom", "shipping", "shipment_assigned", "Ocean FCL", 28000, d(5, 24), { shipmentId: "ship-fcl125" }),
  sp("sub-sh-fcl125-6", "m-sh8", "Lobby Signage", "Acrylic signage x 40", "sup-freedom", "shipping", "shipment_assigned", "Ocean FCL", 18000, d(5, 30), { shipmentId: "ship-fcl125" }),
  // FCL-126 — 4 sub-projects mixed Freedom + Yiwu
  sp("sub-sh-fcl126-1", "m-sh5", "Store Signage", "Printed signage x 120", "sup-freedom", "shipping", "shipment_assigned", "Ocean FCL", 19000, d(5, 24), { shipmentId: "ship-fcl126" }),
  sp("sub-sh-fcl126-2", "m-sh4", "Booth Crate", "Demo booth + parts", "sup-freedom", "shipping", "shipment_assigned", "Ocean FCL", 14000, d(5, 22), { shipmentId: "ship-fcl126" }),
  sp("sub-sh-fcl126-3", "m-sh4", "Booth Giveaways", "Branded merch x 500", "sup-yiwu", "shipping", "shipment_assigned", "Ocean FCL", 8000, d(5, 22), { shipmentId: "ship-fcl126" }),
  sp("sub-sh-fcl126-4", "m-sh8", "Welcome Amenity Kits", "Resort kits x 800", "sup-yiwu", "shipping", "shipment_assigned", "Ocean FCL", 16000, d(5, 30), { shipmentId: "ship-fcl126" }),
  // LCL-088 — 1 sub-project from Admax (has Customs Pending tag)
  sp("sub-sh-lcl088-1", "m-sh6", "Branch Signage", "Acrylic signage x 80", "sup-admax", "shipping", "shipment_assigned", "Ocean LCL", 28000, d(5, 26), { shipmentId: "ship-lcl088", orderType: "Re-order", tag: "Customs Pending" }),

  // ── SHIPPING · Delivered (archive) ──
  sp("sub-sh-fcl120-1", "m-sh1", "Cooler Bags (Delivered)", "Insulated bags x 800", "sup-freedom", "shipping", "shipment_delivered", "Ocean FCL", 12000, d(4, 18), { shipmentId: "ship-fcl120" }),
  sp("sub-sh-dhl2401-1", "m-sh3", "Express Bundles", "Report packs x 200", "sup-admax", "shipping", "shipment_delivered", "Air", 6500, d(4, 10), { shipmentId: "ship-dhl2401" }),

  // ── FINANCE · Invoice Required ──
  sp("sub-f0a", "m-f0a", "Amenity Kits", "Inflight kits x 5000", "sup-freedom", "finance", "invoice_required", "Ocean LCL", 62000, d(5, 29)),
  sp("sub-f0b", "m-f0b", "Rum Gift Boxes", "Premium gift boxes x 600", "sup-ningbo", "finance", "invoice_required", "Ocean FCL", 26000, d(5, 12), { orderType: "Re-order" }),
  sp("sub-f0c", "m-f0c", "Hi-Vis Gear", "Vests + hats x 400", "sup-ningbo", "finance", "invoice_required", "Ocean FCL", 21000, d(5, 8)),
  sp("sub-f0d", "m-f0d", "POS Shelf Strips", "Printed strips x 8000", "sup-shenzhen", "finance", "invoice_required", "Ocean LCL", 18000, d(5, 6)),
  sp("sub-f0e", "m-f0e", "Custom Labels", "Die-cut labels x 50k", "sup-shenzhen", "finance", "invoice_required", "Air", 14500, d(5, 4)),

  // ── FINANCE · Invoiced ──
  sp("sub-f1a", "m-f1", "Branded Robes", "Spa robes x 400", "sup-ningbo", "finance", "invoiced", "Ocean LCL", 28000, d(5, 25), { orderType: "Re-order" }),
  sp("sub-f1b", "m-f1", "Amenity Kits", "Toiletry pouches x 1200", "sup-yiwu", "finance", "invoiced", "Ocean LCL", 10000, d(5, 25), { orderType: "Re-order" }),
  sp("sub-f2a", "m-f2", "Counter Displays", "Acrylic displays x 80", "sup-shenzhen", "finance", "invoiced", "Ocean FCL", 26000, d(5, 28)),
  sp("sub-f2b", "m-f2", "Crew Polos", "Embroidered polos x 600", "sup-ningbo", "finance", "invoiced", "Ocean FCL", 20000, d(5, 28)),
  sp("sub-f3a", "m-f3", "Brochure Binders", "Branded binders x 500", "sup-shenzhen", "finance", "invoiced", "Air", 14000, d(5, 30), { orderType: "Re-order" }),
  sp("sub-f3b", "m-f3", "Cotton Totes", "Eco totes x 1000", "sup-ningbo", "finance", "invoiced", "Air", 14000, d(5, 30), { orderType: "Re-order" }),
  sp("sub-f4a", "m-f4", "ATM Vinyl Wraps", "Full wraps x 35", "sup-shenzhen", "finance", "invoiced", "Air", 22000, d(6, 2)),

  // ── FINANCE · Paid ──
  sp("sub-f5a", "m-f5", "Cooler Bags", "Insulated bags x 1500", "sup-freedom", "finance", "paid", "Ocean FCL", 24000, d(5, 5)),
  sp("sub-f5b", "m-f5", "Beach Shades", "Pop-up shades x 80", "sup-freedom", "finance", "paid", "Ocean FCL", 14000, d(5, 5)),
  sp("sub-f6a", "m-f6", "AGM Bundles", "Report packs x 800", "sup-freedom", "finance", "paid", "Air", 17500, d(5, 3)),
  sp("sub-f7a", "m-f7", "Booth Crate", "Demo booth + parts", "sup-shenzhen", "finance", "paid", "Ocean LCL", 14000, d(5, 7)),
  sp("sub-f7b", "m-f7", "Booth Giveaways", "Branded merch x 500", "sup-yiwu", "finance", "paid", "Ocean LCL", 8000, d(5, 7)),
  sp("sub-f8a", "m-f8", "Rum Gift Boxes", "Premium gift boxes x 600", "sup-ningbo", "finance", "paid", "Ocean FCL", 26000, d(5, 1), { orderType: "Re-order" }),
];

// ─────────── Reference numbers + line items (deterministic enrichment) ───────────
// Quote numbers: every master that has reached "quote" or beyond gets one.
// Invoice numbers: every master in finance gets one.
// PO numbers: every sub gets one.
// Line items: each sub gets a realistic 4–6 item breakdown.

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
  const count = 4 + (h % 3); // 4, 5, or 6
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

// Assign quote numbers to every master that has reached the "quote" stage or later.
const STAGES_BEFORE_QUOTE: StageId[] = ["proposal"];
let quoteSeq = 2040;
const masterQuoteNumber = new Map<string, string>();
const masterInvoiceNumber = new Map<string, string>();
let invoiceSeq = 1040;
for (const m of MASTERS) {
  // every master that ever progressed past Proposal gets a Quote number.
  // For Sales archived without quoting we still skip if stage === proposal or it was archived as Cold/Lost from proposal.
  const skipQuote =
    (m.pipeline === "sales" && m.stage === "proposal") ||
    (m.pipeline === "sales" && m.stage === "archive" && (m.tag === "Lost" || m.tag === "Other"));
  if (!skipQuote) {
    masterQuoteNumber.set(m.id, `Q-${quoteSeq++}`);
  }
  if (m.pipeline === "finance") {
    masterInvoiceNumber.set(m.id, `INV-${invoiceSeq++}`);
  }
}

let poSeq = 1080;
for (const s of SUBS) {
  s.poNumber = `PO-${poSeq++}`;
  s.lineItems = pickItems(s.id);
}

export function getQuoteNumber(masterId: string): string | undefined {
  return masterQuoteNumber.get(masterId);
}
export function getInvoiceNumber(masterId: string): string | undefined {
  return masterInvoiceNumber.get(masterId);
}

// ─────────── Lookups ───────────
export const getMaster = (id: string) => MASTERS.find((x) => x.id === id);
export const getSupplier = (id: string) => SUPPLIERS.find((x) => x.id === id);
export const getShipment = (id?: string) => (id ? SHIPMENTS.find((x) => x.id === id) : undefined);
export const getSubsForMaster = (masterId: string) => SUBS.filter((s) => s.masterId === masterId);
export const getSubsForSupplier = (supplierId: string) => SUBS.filter((s) => s.supplierId === supplierId);
export const getSubsForShipment = (shipmentId: string) => SUBS.filter((s) => s.shipmentId === shipmentId);


// Build pipeline cards: in Sales we use masters; otherwise we use subs.
export function buildCards(pipeline: PipelineId): PipelineCard[] {
  if (pipeline === "sales") {
    return MASTERS.filter((m) => m.pipeline === "sales").map((master) => ({
      kind: "master",
      id: master.id,
      master,
      pipeline: master.pipeline,
      stage: master.stage,
      deadline: master.deadline,
      deadlineDate: master.deadlineDate,
      shippingMode: master.shippingMode,
      orderType: master.orderType,
      priority: master.priority,
      tag: master.tag,
    }));
  }
  return SUBS.filter((s) => s.pipeline === pipeline).map((sub) => {
    const master = getMaster(sub.masterId)!;
    return {
      kind: "sub",
      id: sub.id,
      master,
      sub,
      supplier: getSupplier(sub.supplierId),
      shipment: getShipment(sub.shipmentId),
      pipeline: sub.pipeline,
      stage: sub.stage,
      deadline: sub.deadline,
      deadlineDate: sub.deadlineDate,
      shippingMode: sub.shippingMode,
      orderType: sub.orderType,
      priority: sub.priority,
      tag: sub.tag,
    };
  });
}

export function pipelineCounts(): Record<PipelineId, number> {
  return {
    sales: MASTERS.filter((m) => m.pipeline === "sales").length,
    operations: SUBS.filter((s) => s.pipeline === "operations").length,
    shipping: SUBS.filter((s) => s.pipeline === "shipping").length,
    finance: SUBS.filter((s) => s.pipeline === "finance").length,
  };
}

// ─────────── Back-compat shims ───────────
export interface Project {
  id: string;
  customer: string;
  pointPerson: string;
  projectName: string;
  summary: string;
  deadline: string;
  deadlineDate: Date;
  pipeline: PipelineId;
  stage: StageId;
  shippingMode: ShippingMode;
  orderType: OrderType;
  priority: Priority;
}

export const allProjects: Project[] = MASTERS.map((m) => ({
  id: m.id,
  customer: m.customer,
  pointPerson: m.pointPerson,
  projectName: m.projectName,
  summary: m.summary,
  deadline: m.deadline,
  deadlineDate: m.deadlineDate,
  pipeline: m.pipeline,
  stage: m.stage,
  shippingMode: m.shippingMode,
  orderType: m.orderType,
  priority: m.priority,
}));
