export type PipelineId = "sales" | "production" | "shipping" | "finance";

export type StageId =
  // sales
  | "proposal" | "quote" | "confirming" | "cold" | "lost"
  // production
  | "artwork" | "production" | "ready"
  // shipping
  | "booking" | "transit" | "customs" | "delivered"
  // finance
  | "invoiced" | "paid";

export type ShippingMode = "Air" | "Ocean LCL" | "Ocean FCL";
export type OrderType = "New" | "Re-order";
export type Priority = "Standard" | "Rush";

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
      { id: "cold", title: "Cold" },
      { id: "lost", title: "Lost" },
    ],
  },
  {
    id: "production",
    title: "Production",
    stages: [
      { id: "artwork", title: "Artwork" },
      { id: "production", title: "Production" },
      { id: "ready", title: "Ready to Ship" },
    ],
  },
  {
    id: "shipping",
    title: "Shipping",
    stages: [
      { id: "booking", title: "Booking" },
      { id: "transit", title: "In Transit" },
      { id: "customs", title: "Customs" },
      { id: "delivered", title: "Delivered" },
    ],
  },
  {
    id: "finance",
    title: "Finance",
    stages: [
      { id: "invoiced", title: "Invoiced" },
      { id: "paid", title: "Paid" },
    ],
  },
];

export const STAGE_ACCENT: Record<StageId, string> = {
  proposal: "indigo", quote: "amber", confirming: "emerald",
  cold: "slate", lost: "rose",
  artwork: "violet", production: "orange", ready: "teal",
  booking: "sky", transit: "cyan", customs: "fuchsia", delivered: "emerald",
  invoiced: "amber", paid: "emerald",
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
export interface MasterProject {
  id: string;
  customer: string;
  pointPerson: string;
  projectName: string;
  summary: string;
  deadline: string;
  deadlineDate: Date;
  value: number; // total project value USD
  pipeline: PipelineId; // current "umbrella" pipeline (highest stage reached)
  stage: StageId;       // for sales-only masters
  shippingMode: ShippingMode;
  orderType: OrderType;
  priority: Priority;
}

export interface SubProject {
  id: string;
  masterId: string;
  itemName: string;        // "Promotional Pens"
  summary: string;         // brief
  supplierId: string;
  shippingMode: ShippingMode;
  shipmentId?: string;     // assigned when in shipping
  pipeline: PipelineId;    // production / shipping / finance
  stage: StageId;
  deadline: string;
  deadlineDate: Date;
  value: number;
  priority: Priority;
  orderType: OrderType;
}

export interface Shipment {
  id: string;
  code: string;            // "FCL-125"
  mode: ShippingMode;
  supplierId: string;
  etd: Date;
  eta: Date;
  status: "Booked" | "In Transit" | "Customs" | "Delivered";
}

// ─────────── Unified pipeline card ───────────
// In Sales, a card represents a Master.
// In Production/Shipping/Finance, a card represents a SubProject (with its master).
export interface PipelineCard {
  kind: "master" | "sub";
  id: string;
  master: MasterProject;
  sub?: SubProject;
  supplier?: Supplier;
  shipment?: Shipment;
  // resolved display fields
  pipeline: PipelineId;
  stage: StageId;
  deadline: string;
  deadlineDate: Date;
  shippingMode: ShippingMode;
  orderType: OrderType;
  priority: Priority;
}

// ─────────── Helpers ───────────
const d = (m: number, day: number) => new Date(2026, m - 1, day);
const fmt = (date: Date) =>
  `${date.getDate()} ${date.toLocaleString("en-US", { month: "short" })}`;

const m = (
  id: string, customer: string, pointPerson: string, projectName: string, summary: string,
  date: Date, value: number, pipeline: PipelineId, stage: StageId,
  shippingMode: ShippingMode = "Air", orderType: OrderType = "New", priority: Priority = "Standard",
): MasterProject => ({
  id, customer, pointPerson, projectName, summary,
  deadline: fmt(date), deadlineDate: date, value,
  pipeline, stage, shippingMode, orderType, priority,
});

// ─────────── Master Projects ───────────
export const MASTERS: MasterProject[] = [
  // SALES — masters only
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
  m("m-s19", "PriceSmart", "Omar Hassan", "Membership Drive", "Branded reusables", d(6, 8), 11000, "sales", "cold"),
  m("m-s20", "Courts Caribbean", "Isabelle Dubois", "Storefront Kit", "Window decals", d(6, 12), 8500, "sales", "cold", "Ocean LCL"),
  m("m-s21", "Lucozade Caribbean", "Lena Petrova", "Sports Sponsorship", "Athlete kits", d(6, 15), 15000, "sales", "cold", "Air", "Re-order"),
  m("m-s22", "KFC Barbados", "Javier Rodriguez", "Crew Apparel", "Uniform refresh", d(5, 30), 0, "sales", "lost"),
  m("m-s23", "Subway TT", "Tom Becker", "Loyalty Cards", "Branded card stock", d(6, 5), 0, "sales", "lost"),
  m("m-s24", "Burger King JM", "Hana Yusuf", "Promo Cups", "Limited edition cups", d(6, 8), 0, "sales", "lost"),

  // PRODUCTION — masters (their subs split)
  m("m-pr1", "Bermudez Group", "Lucia Ramos", "Snack Launch", "Display stands & POS", d(5, 14), 34000, "production", "artwork", "Ocean LCL", "New", "Rush"),
  m("m-pr2", "Carib Brewery", "Mark Yeung", "Stadium Activation", "Coolers + banners", d(5, 19), 52000, "production", "artwork", "Ocean FCL"),
  m("m-pr3", "WIBISCO", "Aisha Khan", "Biscuit Promo", "POS shelf strips", d(5, 22), 18000, "production", "artwork"),
  m("m-pr4", "Solo Beverages", "Devon Ali", "Summer SKUs", "Custom labels", d(5, 23), 14500, "production", "artwork", "Air"),
  m("m-pr5", "BTMI", "Melissa McGeary", "Trade Show", "Brochure binders + tote bags", d(5, 17), 28000, "production", "production", "Air", "Re-order", "Rush"),
  m("m-pr6", "Digicel", "Anya Sharma", "Retail Refresh", "Counter displays + uniforms", d(5, 21), 46000, "production", "production", "Ocean FCL"),
  m("m-pr7", "Sandals Resorts", "David Chen", "Spa Amenities", "Branded robes + amenity kits", d(5, 24), 38000, "production", "production", "Ocean LCL", "Re-order"),
  m("m-pr8", "Republic Bank", "Sarah Kim", "ATM Wraps", "Vinyl branding", d(5, 28), 22000, "production", "production"),
  m("m-pr9", "Massy Stores", "Mike Lee", "Eco Tote Run", "10k cotton bags", d(5, 30), 32000, "production", "ready", "Ocean FCL", "Re-order"),
  m("m-pr10", "Banks Beer", "Kenji Tanaka", "Festival Kit", "Tents, flags & coolers", d(6, 2), 58000, "production", "ready", "Ocean FCL"),
  m("m-pr11", "Chefette", "Emily Rodriguez", "Uniform Drop", "Crew shirts", d(6, 4), 24000, "production", "ready", "Air", "Re-order"),
  m("m-pr12", "Sagicor", "Carlos Gomez", "Awards Order", "Engraved trophies", d(6, 6), 11500, "production", "ready", "Air"),

  // SHIPPING — masters
  m("m-sh1", "Coca-Cola Caribbean", "Priya Sharma", "Beach Tour", "Cooler bag run + shades", d(5, 18), 38000, "shipping", "booking", "Ocean FCL"),
  m("m-sh2", "Goddard Enterprises", "Jenna Park", "Anniversary Gifts", "Award shipment", d(5, 20), 9800, "shipping", "booking", "Air", "Re-order", "Rush"),
  m("m-sh3", "ANSA McAL", "Rachel Green", "Report Bundle", "AGM materials", d(5, 19), 17500, "shipping", "transit", "Air"),
  m("m-sh4", "GraceKennedy", "Kenji Tanaka", "Trade Show Kit", "Booth crate + giveaways", d(5, 22), 22000, "shipping", "transit", "Ocean LCL"),
  m("m-sh5", "FLOW Caribbean", "Maria Garcia", "Retail Launch", "POS displays + signage", d(5, 24), 47000, "shipping", "transit", "Ocean FCL"),
  m("m-sh6", "NCB Jamaica", "Sam Jones", "Branch Refresh", "Signage shipment", d(5, 26), 28000, "shipping", "customs", "Ocean LCL", "Re-order"),
  m("m-sh7", "First Citizens", "Li Wei", "Onboarding Kit", "Welcome packs", d(5, 27), 13500, "shipping", "customs", "Air"),
  m("m-sh8", "Caribbean Airlines", "Anna Petrova", "Inflight Refresh", "Amenity kits", d(5, 29), 62000, "shipping", "customs", "Ocean LCL"),
  m("m-sh9", "Demerara Distillers", "Evelyn Reed", "Holiday Gift", "Rum gift boxes", d(5, 12), 26000, "shipping", "delivered", "Ocean FCL", "Re-order"),
  m("m-sh10", "Trinidad Cement", "Maria Garcia", "Safety Campaign", "Hi-vis order", d(5, 8), 21000, "shipping", "delivered"),

  // FINANCE — masters
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
  { id: "ship-fcl125", code: "FCL-125", mode: "Ocean FCL", supplierId: "sup-freedom", etd: d(5, 10), eta: d(5, 30), status: "In Transit" },
  { id: "ship-lcl088", code: "LCL-088", mode: "Ocean LCL", supplierId: "sup-shenzhen", etd: d(5, 12), eta: d(5, 28), status: "Customs" },
  { id: "ship-dhl2456", code: "DHL-2456", mode: "Air", supplierId: "sup-admax", etd: d(5, 15), eta: d(5, 19), status: "In Transit" },
  { id: "ship-fcl126", code: "FCL-126", mode: "Ocean FCL", supplierId: "sup-ningbo", etd: d(5, 5), eta: d(5, 26), status: "Booked" },
];

// ─────────── Sub Projects ───────────
// Helper for sub creation
const sp = (
  id: string, masterId: string, itemName: string, summary: string,
  supplierId: string, pipeline: PipelineId, stage: StageId,
  shippingMode: ShippingMode, value: number,
  date: Date, opts: { shipmentId?: string; priority?: Priority; orderType?: OrderType } = {},
): SubProject => ({
  id, masterId, itemName, summary, supplierId, pipeline, stage,
  shippingMode, shipmentId: opts.shipmentId, value,
  deadline: fmt(date), deadlineDate: date,
  priority: opts.priority ?? "Standard", orderType: opts.orderType ?? "New",
});

export const SUBS: SubProject[] = [
  // ── PRODUCTION subs (each master split) ──
  // m-pr1 Bermudez — split 2 suppliers
  sp("sub-pr1a", "m-pr1", "Acrylic Display Stands", "Floor units, branded", "sup-shenzhen", "production", "artwork", "Ocean LCL", 22000, d(5, 14), { priority: "Rush" }),
  sp("sub-pr1b", "m-pr1", "POS Shelf Strips", "Printed strips x 5000", "sup-shenzhen", "production", "artwork", "Ocean LCL", 12000, d(5, 14), { priority: "Rush" }),
  // m-pr2 Carib Brewery — split 2 suppliers
  sp("sub-pr2a", "m-pr2", "Branded Coolers", "60L cooler boxes x 200", "sup-freedom", "production", "artwork", "Ocean FCL", 32000, d(5, 19)),
  sp("sub-pr2b", "m-pr2", "Stadium Banners", "Vinyl 3x1m x 40", "sup-admax", "production", "artwork", "Air", 20000, d(5, 19)),
  // m-pr3 WIBISCO — single supplier
  sp("sub-pr3a", "m-pr3", "POS Shelf Strips", "Printed strips x 8000", "sup-shenzhen", "production", "artwork", "Ocean LCL", 18000, d(5, 22)),
  // m-pr4 Solo — single
  sp("sub-pr4a", "m-pr4", "Custom Labels", "Die-cut labels x 50k", "sup-shenzhen", "production", "artwork", "Air", 14500, d(5, 23)),
  // m-pr5 BTMI — split 2 suppliers
  sp("sub-pr5a", "m-pr5", "Brochure Binders", "Branded binders x 500", "sup-shenzhen", "production", "production", "Air", 14000, d(5, 17), { priority: "Rush", orderType: "Re-order" }),
  sp("sub-pr5b", "m-pr5", "Cotton Tote Bags", "Eco totes x 1000", "sup-ningbo", "production", "production", "Air", 14000, d(5, 17), { priority: "Rush", orderType: "Re-order" }),
  // m-pr6 Digicel — split 2 suppliers
  sp("sub-pr6a", "m-pr6", "Counter Displays", "Acrylic displays x 80", "sup-shenzhen", "production", "production", "Ocean FCL", 26000, d(5, 21)),
  sp("sub-pr6b", "m-pr6", "Crew Polos", "Embroidered polos x 600", "sup-ningbo", "production", "production", "Ocean FCL", 20000, d(5, 21)),
  // m-pr7 Sandals — split
  sp("sub-pr7a", "m-pr7", "Branded Robes", "Spa robes x 400", "sup-ningbo", "production", "production", "Ocean LCL", 28000, d(5, 24), { orderType: "Re-order" }),
  sp("sub-pr7b", "m-pr7", "Amenity Kits", "Toiletry pouches x 1200", "sup-yiwu", "production", "production", "Ocean LCL", 10000, d(5, 24), { orderType: "Re-order" }),
  // m-pr8 Republic — single
  sp("sub-pr8a", "m-pr8", "ATM Vinyl Wraps", "Full wraps x 35 units", "sup-shenzhen", "production", "production", "Air", 22000, d(5, 28)),
  // m-pr9 Massy — single (large run, single supplier)
  sp("sub-pr9a", "m-pr9", "Cotton Tote Bags", "Eco totes x 10000", "sup-ningbo", "production", "ready", "Ocean FCL", 32000, d(5, 30), { orderType: "Re-order" }),
  // m-pr10 Banks Beer — split 3 suppliers (festival kit)
  sp("sub-pr10a", "m-pr10", "Tents", "Branded tents 3x3 x 30", "sup-freedom", "production", "ready", "Ocean FCL", 24000, d(6, 2)),
  sp("sub-pr10b", "m-pr10", "Feather Banners", "Flags x 80", "sup-admax", "production", "ready", "Air", 12000, d(6, 2)),
  sp("sub-pr10c", "m-pr10", "Coolers", "Branded coolers x 150", "sup-freedom", "production", "ready", "Ocean FCL", 22000, d(6, 2)),
  // m-pr11 Chefette — single
  sp("sub-pr11a", "m-pr11", "Crew Shirts", "Embroidered shirts x 800", "sup-ningbo", "production", "ready", "Air", 24000, d(6, 4), { orderType: "Re-order" }),
  // m-pr12 Sagicor — single
  sp("sub-pr12a", "m-pr12", "Engraved Trophies", "Crystal trophies x 60", "sup-yiwu", "production", "ready", "Air", 11500, d(6, 6)),

  // ── SHIPPING subs ──
  // m-sh1 Coca-Cola — split, both with Freedom in FCL-125
  sp("sub-sh1a", "m-sh1", "Cooler Bags", "Insulated bags x 1500", "sup-freedom", "shipping", "booking", "Ocean FCL", 24000, d(5, 18), { shipmentId: "ship-fcl125" }),
  sp("sub-sh1b", "m-sh1", "Beach Shades", "Pop-up shades x 80", "sup-freedom", "shipping", "booking", "Ocean FCL", 14000, d(5, 18), { shipmentId: "ship-fcl125" }),
  // m-sh2 Goddard — single, Admax rush DHL
  sp("sub-sh2a", "m-sh2", "Engraved Awards", "Glass awards x 25", "sup-admax", "shipping", "booking", "Air", 9800, d(5, 20), { shipmentId: "ship-dhl2456", priority: "Rush", orderType: "Re-order" }),
  // m-sh3 ANSA — single, Freedom on FCL-125
  sp("sub-sh3a", "m-sh3", "AGM Bundles", "Report packs x 800", "sup-freedom", "shipping", "transit", "Ocean FCL", 17500, d(5, 19), { shipmentId: "ship-fcl125" }),
  // m-sh4 GraceKennedy — split
  sp("sub-sh4a", "m-sh4", "Booth Crate", "Demo booth + parts", "sup-shenzhen", "shipping", "transit", "Ocean LCL", 14000, d(5, 22), { shipmentId: "ship-lcl088" }),
  sp("sub-sh4b", "m-sh4", "Booth Giveaways", "Branded merch x 500", "sup-yiwu", "shipping", "transit", "Ocean LCL", 8000, d(5, 22), { shipmentId: "ship-lcl088" }),
  // m-sh5 FLOW — split
  sp("sub-sh5a", "m-sh5", "POS Displays", "Floor displays x 60", "sup-freedom", "shipping", "transit", "Ocean FCL", 28000, d(5, 24), { shipmentId: "ship-fcl125" }),
  sp("sub-sh5b", "m-sh5", "Store Signage", "Printed signage x 120", "sup-shenzhen", "shipping", "transit", "Ocean FCL", 19000, d(5, 24), { shipmentId: "ship-fcl126" }),
  // m-sh6 NCB — single
  sp("sub-sh6a", "m-sh6", "Branch Signage", "Acrylic signage x 80", "sup-shenzhen", "shipping", "customs", "Ocean LCL", 28000, d(5, 26), { shipmentId: "ship-lcl088", orderType: "Re-order" }),
  // m-sh7 First Citizens — single
  sp("sub-sh7a", "m-sh7", "Welcome Packs", "Onboarding kits x 300", "sup-freedom", "shipping", "customs", "Air", 13500, d(5, 27)),
  // m-sh8 Caribbean Airlines — single, Freedom on FCL-125
  sp("sub-sh8a", "m-sh8", "Amenity Kits", "Inflight kits x 5000", "sup-freedom", "shipping", "customs", "Ocean FCL", 62000, d(5, 29), { shipmentId: "ship-fcl125" }),
  // m-sh9 Demerara — single (delivered)
  sp("sub-sh9a", "m-sh9", "Rum Gift Boxes", "Premium gift boxes x 600", "sup-ningbo", "shipping", "delivered", "Ocean FCL", 26000, d(5, 12), { orderType: "Re-order" }),
  // m-sh10 Trinidad Cement — single (delivered)
  sp("sub-sh10a", "m-sh10", "Hi-Vis Gear", "Vests + hats x 400", "sup-ningbo", "shipping", "delivered", "Ocean FCL", 21000, d(5, 8)),

  // ── FINANCE subs ──
  sp("sub-f1a", "m-f1", "Branded Robes", "Spa robes x 400", "sup-ningbo", "finance", "invoiced", "Ocean LCL", 28000, d(5, 25), { orderType: "Re-order" }),
  sp("sub-f1b", "m-f1", "Amenity Kits", "Toiletry pouches x 1200", "sup-yiwu", "finance", "invoiced", "Ocean LCL", 10000, d(5, 25), { orderType: "Re-order" }),
  sp("sub-f2a", "m-f2", "Counter Displays", "Acrylic displays x 80", "sup-shenzhen", "finance", "invoiced", "Ocean FCL", 26000, d(5, 28)),
  sp("sub-f2b", "m-f2", "Crew Polos", "Embroidered polos x 600", "sup-ningbo", "finance", "invoiced", "Ocean FCL", 20000, d(5, 28)),
  sp("sub-f3a", "m-f3", "Brochure Binders", "Branded binders x 500", "sup-shenzhen", "finance", "invoiced", "Air", 14000, d(5, 30), { orderType: "Re-order" }),
  sp("sub-f3b", "m-f3", "Cotton Totes", "Eco totes x 1000", "sup-ningbo", "finance", "invoiced", "Air", 14000, d(5, 30), { orderType: "Re-order" }),
  sp("sub-f4a", "m-f4", "ATM Vinyl Wraps", "Full wraps x 35", "sup-shenzhen", "finance", "invoiced", "Air", 22000, d(6, 2)),
  sp("sub-f5a", "m-f5", "Cooler Bags", "Insulated bags x 1500", "sup-freedom", "finance", "paid", "Ocean FCL", 24000, d(5, 5)),
  sp("sub-f5b", "m-f5", "Beach Shades", "Pop-up shades x 80", "sup-freedom", "finance", "paid", "Ocean FCL", 14000, d(5, 5)),
  sp("sub-f6a", "m-f6", "AGM Bundles", "Report packs x 800", "sup-freedom", "finance", "paid", "Air", 17500, d(5, 3)),
  sp("sub-f7a", "m-f7", "Booth Crate", "Demo booth + parts", "sup-shenzhen", "finance", "paid", "Ocean LCL", 14000, d(5, 7)),
  sp("sub-f7b", "m-f7", "Booth Giveaways", "Branded merch x 500", "sup-yiwu", "finance", "paid", "Ocean LCL", 8000, d(5, 7)),
  sp("sub-f8a", "m-f8", "Rum Gift Boxes", "Premium gift boxes x 600", "sup-ningbo", "finance", "paid", "Ocean FCL", 26000, d(5, 1), { orderType: "Re-order" }),
];

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
    };
  });
}

export function pipelineCounts(): Record<PipelineId, number> {
  return {
    sales: MASTERS.filter((m) => m.pipeline === "sales").length,
    production: SUBS.filter((s) => s.pipeline === "production").length,
    shipping: SUBS.filter((s) => s.pipeline === "shipping").length,
    finance: SUBS.filter((s) => s.pipeline === "finance").length,
  };
}

// ─────────── Back-compat shims (legacy `Project` type used by old card) ───────────
// Kept so any leftover imports don't break; pipeline cards now use PipelineCard.
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
