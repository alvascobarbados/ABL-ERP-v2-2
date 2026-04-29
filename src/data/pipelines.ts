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

// Stage accent color tokens
export const STAGE_ACCENT: Record<StageId, string> = {
  proposal: "indigo",
  quote: "amber",
  confirming: "emerald",
  cold: "slate",
  lost: "rose",
  artwork: "violet",
  production: "orange",
  ready: "teal",
  booking: "sky",
  transit: "cyan",
  customs: "fuchsia",
  delivered: "emerald",
  invoiced: "amber",
  paid: "emerald",
};

const d = (m: number, day: number) => new Date(2026, m - 1, day);
const fmt = (date: Date) =>
  `${date.getDate()} ${date.toLocaleString("en-US", { month: "short" })}`;

const p = (
  id: string,
  customer: string,
  pointPerson: string,
  projectName: string,
  summary: string,
  date: Date,
  pipeline: PipelineId,
  stage: StageId,
  shippingMode: ShippingMode = "Air",
  orderType: OrderType = "New",
  priority: Priority = "Standard",
): Project => ({
  id,
  customer,
  pointPerson,
  projectName,
  summary,
  deadline: fmt(date),
  deadlineDate: date,
  pipeline,
  stage,
  shippingMode,
  orderType,
  priority,
});

export const allProjects: Project[] = [
  // ───────── SALES (24) ─────────
  // Proposal
  p("s1", "BTMI", "Melissa McGeary", "Connect Barbados", "Welcome party premiums", d(5, 16), "sales", "proposal", "Air", "New", "Rush"),
  p("s2", "Digicel", "Anya Sharma", "Summer Activation", "Branded merchandise kits", d(5, 18), "sales", "proposal", "Ocean LCL", "New"),
  p("s3", "Banks Beer", "Kenji Tanaka", "Crop Over 2026", "Festival giveaways", d(5, 22), "sales", "proposal", "Ocean FCL", "Re-order"),
  p("s4", "Sandals Resorts", "David Chen", "Guest Welcome", "Eco-friendly amenity bags", d(5, 10), "sales", "proposal", "Air", "New", "Rush"),
  p("s5", "Republic Bank", "Sarah Kim", "AGM 2026", "Executive gift sets", d(5, 12), "sales", "proposal"),
  p("s6", "Massy Stores", "Mike Lee", "Loyalty Program", "Reusable shopping totes", d(5, 27), "sales", "proposal", "Ocean FCL", "Re-order"),
  // Quote
  p("s7", "Chefette", "Emily Rodriguez", "Drive-Thru Refresh", "Branded uniforms", d(5, 9), "sales", "quote", "Air", "Re-order", "Rush"),
  p("s8", "Sagicor", "Carlos Gomez", "Sales Conference", "Awards & trophies", d(5, 24), "sales", "quote"),
  p("s9", "Coca-Cola Caribbean", "Priya Sharma", "Beach Tour", "Cooler bags & shades", d(5, 13), "sales", "quote", "Ocean FCL", "New"),
  p("s10", "Goddard Enterprises", "Jenna Park", "Anniversary Gifts", "Custom desk awards", d(5, 29), "sales", "quote"),
  p("s11", "ANSA McAL", "Rachel Green", "Shareholder Pack", "Annual report bundle", d(5, 18), "sales", "quote", "Air"),
  p("s12", "GraceKennedy", "Kenji Tanaka", "Trade Show Kit", "Booth giveaways", d(5, 16), "sales", "quote", "Ocean LCL", "New", "Rush"),
  // Confirming
  p("s13", "FLOW Caribbean", "Maria Garcia", "Retail Launch", "POS displays", d(5, 20), "sales", "confirming", "Ocean FCL", "New"),
  p("s14", "NCB Jamaica", "Sam Jones", "Branch Refresh", "Signage & stationery", d(5, 17), "sales", "confirming"),
  p("s15", "First Citizens", "Li Wei", "Onboarding Kit", "New hire welcome packs", d(5, 19), "sales", "confirming", "Air", "Re-order"),
  p("s16", "Caribbean Airlines", "Anna Petrova", "Inflight Refresh", "Branded amenity kits", d(5, 21), "sales", "confirming", "Ocean LCL"),
  p("s17", "Demerara Distillers", "Evelyn Reed", "Holiday Gift", "Premium rum boxes", d(5, 26), "sales", "confirming", "Ocean FCL", "Re-order"),
  p("s18", "Trinidad Cement", "Maria Garcia", "Safety Campaign", "Hi-vis branded gear", d(5, 25), "sales", "confirming"),
  // Cold
  p("s19", "PriceSmart", "Omar Hassan", "Membership Drive", "Branded reusables", d(6, 8), "sales", "cold"),
  p("s20", "Courts Caribbean", "Isabelle Dubois", "Storefront Kit", "Window decals", d(6, 12), "sales", "cold", "Ocean LCL"),
  p("s21", "Lucozade Caribbean", "Lena Petrova", "Sports Sponsorship", "Athlete kits", d(6, 15), "sales", "cold", "Air", "Re-order"),
  // Lost
  p("s22", "KFC Barbados", "Javier Rodriguez", "Crew Apparel", "Uniform refresh", d(5, 30), "sales", "lost"),
  p("s23", "Subway TT", "Tom Becker", "Loyalty Cards", "Branded card stock", d(6, 5), "sales", "lost"),
  p("s24", "Burger King JM", "Hana Yusuf", "Promo Cups", "Limited edition cups", d(6, 8), "sales", "lost"),

  // ───────── PRODUCTION (12) ─────────
  p("pr1", "Bermudez Group", "Lucia Ramos", "Snack Launch", "Display stands", d(5, 14), "production", "artwork", "Ocean LCL", "New", "Rush"),
  p("pr2", "Carib Brewery", "Mark Yeung", "Stadium Activation", "Branded coolers", d(5, 19), "production", "artwork", "Ocean FCL"),
  p("pr3", "WIBISCO", "Aisha Khan", "Biscuit Promo", "POS shelf strips", d(5, 22), "production", "artwork"),
  p("pr4", "Solo Beverages", "Devon Ali", "Summer SKUs", "Custom labels", d(5, 23), "production", "artwork", "Air"),
  p("pr5", "BTMI", "Melissa McGeary", "Trade Show", "Brochure binders", d(5, 17), "production", "production", "Air", "Re-order", "Rush"),
  p("pr6", "Digicel", "Anya Sharma", "Retail Refresh", "Counter displays", d(5, 21), "production", "production", "Ocean FCL"),
  p("pr7", "Sandals Resorts", "David Chen", "Spa Amenities", "Branded robes", d(5, 24), "production", "production", "Ocean LCL", "Re-order"),
  p("pr8", "Republic Bank", "Sarah Kim", "ATM Wraps", "Vinyl branding", d(5, 28), "production", "production"),
  p("pr9", "Massy Stores", "Mike Lee", "Eco Tote Run", "10k cotton bags", d(5, 30), "production", "ready", "Ocean FCL", "Re-order"),
  p("pr10", "Banks Beer", "Kenji Tanaka", "Festival Kit", "Tents & flags", d(6, 2), "production", "ready", "Ocean FCL"),
  p("pr11", "Chefette", "Emily Rodriguez", "Uniform Drop", "Crew shirts", d(6, 4), "production", "ready", "Air", "Re-order"),
  p("pr12", "Sagicor", "Carlos Gomez", "Awards Order", "Engraved trophies", d(6, 6), "production", "ready", "Air"),

  // ───────── SHIPPING (10) ─────────
  p("sh1", "Coca-Cola Caribbean", "Priya Sharma", "Beach Tour", "Cooler bag run", d(5, 18), "shipping", "booking", "Ocean FCL", "New"),
  p("sh2", "Goddard Enterprises", "Jenna Park", "Anniversary Gifts", "Award shipment", d(5, 20), "shipping", "booking", "Air", "Re-order", "Rush"),
  p("sh3", "ANSA McAL", "Rachel Green", "Report Bundle", "AGM materials", d(5, 19), "shipping", "transit", "Air"),
  p("sh4", "GraceKennedy", "Kenji Tanaka", "Trade Show Kit", "Booth crate", d(5, 22), "shipping", "transit", "Ocean LCL"),
  p("sh5", "FLOW Caribbean", "Maria Garcia", "Retail Launch", "POS display crates", d(5, 24), "shipping", "transit", "Ocean FCL"),
  p("sh6", "NCB Jamaica", "Sam Jones", "Branch Refresh", "Signage shipment", d(5, 26), "shipping", "customs", "Ocean LCL", "Re-order"),
  p("sh7", "First Citizens", "Li Wei", "Onboarding Kit", "Welcome packs", d(5, 27), "shipping", "customs", "Air"),
  p("sh8", "Caribbean Airlines", "Anna Petrova", "Inflight Refresh", "Amenity kits", d(5, 29), "shipping", "customs", "Ocean LCL"),
  p("sh9", "Demerara Distillers", "Evelyn Reed", "Holiday Gift", "Rum gift boxes", d(5, 12), "shipping", "delivered", "Ocean FCL", "Re-order"),
  p("sh10", "Trinidad Cement", "Maria Garcia", "Safety Campaign", "Hi-vis order", d(5, 8), "shipping", "delivered"),

  // ───────── FINANCE (8) ─────────
  p("f1", "Sandals Resorts", "David Chen", "Spa Amenities", "Invoice #4821", d(5, 25), "finance", "invoiced", "Ocean LCL", "Re-order"),
  p("f2", "Digicel", "Anya Sharma", "Retail Refresh", "Invoice #4822", d(5, 28), "finance", "invoiced", "Ocean FCL"),
  p("f3", "BTMI", "Melissa McGeary", "Trade Show", "Invoice #4823", d(5, 30), "finance", "invoiced", "Air", "Re-order"),
  p("f4", "Republic Bank", "Sarah Kim", "ATM Wraps", "Invoice #4824", d(6, 2), "finance", "invoiced"),
  p("f5", "Coca-Cola Caribbean", "Priya Sharma", "Beach Tour", "Paid in full", d(5, 5), "finance", "paid", "Ocean FCL"),
  p("f6", "ANSA McAL", "Rachel Green", "Report Bundle", "Paid in full", d(5, 3), "finance", "paid", "Air"),
  p("f7", "GraceKennedy", "Kenji Tanaka", "Trade Show Kit", "Paid in full", d(5, 7), "finance", "paid", "Ocean LCL", "New"),
  p("f8", "Demerara Distillers", "Evelyn Reed", "Holiday Gift", "Paid in full", d(5, 1), "finance", "paid", "Ocean FCL", "Re-order"),
];
