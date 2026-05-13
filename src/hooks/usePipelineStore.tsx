import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from "react";
import { toast } from "sonner";
import {
  PIPELINES, PipelineId, StageId, Project, Shipment, Supplier, ProjectNote, LineItem,
  ProjectLogEntry, ProjectLogActionType,
  SUPPLIERS, ShippingMode, PaymentMethod, WeightUnit, VolumeUnit,
} from "@/data/pipelines";
import { useCurrentUser, type CurrentUser } from "./useCurrentUser";
import { supabase } from "@/integrations/supabase/client";

// Strip a known prefix and any non-digits. Returns undefined for empty.
// Defensive: DB should hold plain digits, but legacy rows may include "Q-"/"PO-"/"INV-".
function stripRefPrefix(raw: unknown, prefix: string): string | undefined {
  if (raw == null) return undefined;
  const s = String(raw).trim();
  if (!s) return undefined;
  const px = prefix.replace(/-$/, "");
  const re = new RegExp(`^\\s*${px}-?`, "i");
  const cleaned = s.replace(re, "").replace(/\D/g, "");
  return cleaned || undefined;
}

// ─────────── Log helpers ───────────
function makeLogId() {
  return `log-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function appendLog(p: Project, entry: Omit<ProjectLogEntry, "id" | "ts"> & { ts?: Date }): { project: Project; entry: ProjectLogEntry } {
  const full: ProjectLogEntry = {
    id: makeLogId(),
    ts: entry.ts ?? new Date(),
    actor: entry.actor,
    actionType: entry.actionType,
    description: entry.description,
    metadata: entry.metadata,
  };
  return { project: { ...p, log: [...(p.log ?? []), full] }, entry: full };
}

function actorOf(u: CurrentUser) {
  return { userId: u.userId, displayName: u.shortName };
}

function pipelineStageLabel(pipeline: PipelineId, stage: StageId): string {
  const p = PIPELINES.find((x) => x.id === pipeline);
  const s = p?.stages.find((x) => x.id === stage);
  return `${p?.title ?? pipeline} · ${s?.title ?? stage}`;
}

const FIELD_LABELS: Partial<Record<keyof Project, string>> = {
  customer: "customer",
  projectName: "project name",
  detailSummary: "detail",
  supplierId: "supplier",
  supplierLabel: "supplier",
  shippingMode: "mode",
  trackingRef: "tracking",
  shipmentNumber: "shipment number",
  weightKg: "weight",
  weightUnit: "weight unit",
  volumeValue: "volume",
  volumeUnit: "volume unit",
  numPackages: "no. of packages",
  designBrief: "design brief",
  completionDate: "completion date",
  outstandingBalance: "outstanding balance",
  contactPerson: "contact",
  buyerId: "buyer",
  pointPerson: "sales rep",
  deadline: "deadline",
  deadlineDate: "deadline",
  value: "amount",
  quoteNumber: "Q#",
  proofNumber: "proof number",
  poNumber: "PO#",
  invoiceNumber: "invoice number",
  paymentTerms: "payment terms",
  invoiceIssuedDate: "invoice issued date",
  poAmountUsd: "PO amount",
  depositRequired: "deposit required",
  depositInvoiceNumber: "deposit invoice",
  depositAmount: "deposit amount",
  depositPaidDate: "deposit paid date",
  depositPaidMethod: "deposit paid method",
  depositPaymentReference: "deposit payment reference",
  paidOnDate: "paid date",
  paymentMethod: "paid method",
  paymentReference: "payment reference",
};

const SUPPRESSED_FIELDS = new Set<keyof Project>([
  "updatedAt", "createdAt", "log", "notes", "lineItems",
  "pipeline", "stage", "flagged",
  "deletedAt", "deletedFromPipeline", "deletedFromStage",
  "invoiceRequiredEnteredAt", "invoiceIssuedDateAssumed",
  "paymentTermsInherited", "paymentTermsCustomDays",
  "salesShippingLabel",
  // legacy mirror — Volume fields are the source of truth now
  "cbm",
]);

function fmtVal(field: keyof Project, val: unknown, suppliers: Supplier[]): string {
  if (val == null || val === "") return "—";
  if (field === "supplierId") {
    return suppliers.find((s) => s.id === val)?.name ?? String(val);
  }
  if (field === "buyerId") {
    // Buyer names aren't accessible from the store. The detail-page caller
    // augments the patch with a synthetic field beforehand if it wants name
    // resolution; here we fall back to a generic placeholder for IDs.
    return typeof val === "string" && val.length === 36 ? "(buyer)" : String(val);
  }
  if (val instanceof Date) {
    return `${val.getDate()} ${val.toLocaleString("en-US", { month: "short" })} ${val.getFullYear()}`;
  }
  if (field === "value" && typeof val === "number") return `$${val.toLocaleString()}`;
  return String(val);
}

function buildFieldEditEntries(
  prev: Project, patch: Partial<Project>, actor: CurrentUser, suppliers: Supplier[],
): Array<Omit<ProjectLogEntry, "id" | "ts">> {
  const out: Array<Omit<ProjectLogEntry, "id" | "ts">> = [];
  const name = actor.shortName;
  for (const key of Object.keys(patch) as (keyof Project)[]) {
    if (SUPPRESSED_FIELDS.has(key)) continue;
    const before = (prev as any)[key];
    const after = (patch as any)[key];
    if (before === after) continue;
    if (before instanceof Date && after instanceof Date && before.getTime() === after.getTime()) continue;
    const label = FIELD_LABELS[key];
    if (!label) continue;
    const fromStr = fmtVal(key, before, suppliers);
    const toStr = fmtVal(key, after, suppliers);
    let desc: string;
    if (before == null || before === "") desc = `${name} set ${label} to ${toStr}`;
    else if (after == null || after === "") desc = `${name} cleared ${label}`;
    else desc = `${name} changed ${label} from ${fromStr} to ${toStr}`;
    out.push({
      actor: actorOf(actor),
      actionType: "field_edit",
      description: desc,
      metadata: { field: String(key), fromValue: before as any, toValue: after as any },
    });
  }
  return out;
}

// ─────────── Date serialization (Supabase ⇄ Project) ───────────
function rowToProject(row: any, notesByProj: Map<string, ProjectNote[]>, logByProj: Map<string, ProjectLogEntry[]>, itemsByProj: Map<string, LineItem[]>): Project {
  return {
    id: row.id,
    customer: row.customer,
    contactPerson: row.contact_person ?? undefined,
    buyerId: row.buyer_id ?? null,
    pointPerson: row.point_person,
    projectName: row.project_name,
    detailSummary: row.detail_summary ?? undefined,
    supplierId: row.supplier_id ?? undefined,
    supplierLabel: row.supplier_label ?? undefined,
    shippingMode: row.shipping_mode ?? undefined,
    salesShippingLabel: row.sales_shipping_label ?? undefined,
    shipmentId: row.shipment_id ?? undefined,
    trackingRef: row.tracking_ref ?? undefined,
    shipmentNumber: row.shipment_number ?? null,
    weightKg: row.weight_kg != null ? Number(row.weight_kg) : undefined,
    cbm: row.cbm != null ? Number(row.cbm) : undefined,
    numPackages: row.num_packages != null ? Number(row.num_packages) : undefined,
    designBrief: row.design_brief ?? undefined,
    completionDate: row.completion_date ? new Date(row.completion_date) : null,
    outstandingBalance: row.outstanding_balance != null ? Number(row.outstanding_balance) : undefined,
    pipeline: row.pipeline_id,
    stage: row.stage_id,
    deadline: row.deadline ?? undefined,
    deadlineDate: row.deadline_date ? new Date(row.deadline_date) : null,
    value: Number(row.value),
    orderType: row.order_type,
    priority: row.priority,
    tag: row.tag ?? undefined,
    quoteNumber: stripRefPrefix(row.quote_number, "Q-"),
    proofNumber: row.proof_number ?? undefined,
    poNumber: stripRefPrefix(row.po_number, "PO-"),
    invoiceNumber: stripRefPrefix(row.invoice_number, "INV-"),
    createdAt: new Date(row.created_at),
    updatedAt: row.updated_at ? new Date(row.updated_at) : undefined,
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : undefined,
    deletedFromPipeline: row.deleted_from_pipeline ?? undefined,
    deletedFromStage: row.deleted_from_stage ?? undefined,
    flagged: !!row.flagged,
    paymentTerms: row.payment_terms ?? undefined,
    paymentTermsCustomDays: row.payment_terms_custom_days ?? undefined,
    paymentTermsInherited: row.payment_terms_inherited ?? undefined,
    invoiceIssuedDate: row.invoice_issued_date ? new Date(row.invoice_issued_date) : undefined,
    invoiceIssuedDateAssumed: row.invoice_issued_date_assumed ?? undefined,
    invoiceRequiredEnteredAt: row.invoice_required_entered_at ? new Date(row.invoice_required_entered_at) : undefined,
    paidOnDate: row.paid_on_date ? new Date(row.paid_on_date) : null,
    paymentMethod: (row.payment_method ?? null) as PaymentMethod | null,
    paymentReference: row.payment_reference ?? null,
    poAmountUsd: row.po_amount_usd != null ? Number(row.po_amount_usd) : null,
    weightUnit: (row.weight_unit ?? "kg") as WeightUnit,
    volumeValue: row.volume_value != null ? Number(row.volume_value) : (row.cbm != null ? Number(row.cbm) : null),
    volumeUnit: (row.volume_unit ?? "CBM") as VolumeUnit,
    depositRequired: !!row.deposit_required,
    depositInvoiceNumber: row.deposit_invoice_number ?? null,
    depositAmount: row.deposit_amount != null ? Number(row.deposit_amount) : null,
    depositPaidDate: row.deposit_paid_date ? new Date(row.deposit_paid_date) : null,
    depositPaidMethod: (row.deposit_paid_method ?? null) as PaymentMethod | null,
    depositPaymentReference: row.deposit_payment_reference ?? null,
    notes: notesByProj.get(row.id),
    log: logByProj.get(row.id),
    lineItems: itemsByProj.get(row.id),
  };
}

function projectToRow(p: Project): any {
  return {
    id: p.id,
    customer: p.customer,
    contact_person: p.contactPerson ?? null,
    buyer_id: p.buyerId ?? null,
    point_person: p.pointPerson,
    project_name: p.projectName ?? "(untitled)",
    detail_summary: p.detailSummary ?? null,
    supplier_id: p.supplierId ?? null,
    supplier_label: p.supplierLabel ?? null,
    shipping_mode: p.shippingMode ?? null,
    sales_shipping_label: p.salesShippingLabel ?? null,
    shipment_id: p.shipmentId ?? null,
    tracking_ref: p.trackingRef ?? null,
    shipment_number: p.shipmentNumber ?? null,
    weight_kg: p.weightKg ?? null,
    cbm: p.cbm ?? null,
    num_packages: p.numPackages ?? null,
    design_brief: p.designBrief ?? null,
    completion_date: p.completionDate ? p.completionDate.toISOString() : null,
    outstanding_balance: p.outstandingBalance ?? null,
    pipeline_id: p.pipeline,
    stage_id: p.stage,
    deadline: p.deadline ?? "—",
    deadline_date: p.deadlineDate ? p.deadlineDate.toISOString() : null,
    value: p.value,
    order_type: p.orderType,
    priority: p.priority,
    tag: p.tag ?? null,
    quote_number: p.quoteNumber ? p.quoteNumber.replace(/^Q-/, "") : null,
    proof_number: p.proofNumber ?? null,
    po_number: p.poNumber ?? null,
    invoice_number: p.invoiceNumber ?? null,
    flagged: !!p.flagged,
    deleted_at: p.deletedAt ? p.deletedAt.toISOString() : null,
    deleted_from_pipeline: p.deletedFromPipeline ?? null,
    deleted_from_stage: p.deletedFromStage ?? null,
    payment_terms: p.paymentTerms ?? null,
    payment_terms_custom_days: p.paymentTermsCustomDays ?? null,
    payment_terms_inherited: p.paymentTermsInherited ?? null,
    invoice_issued_date: p.invoiceIssuedDate ? p.invoiceIssuedDate.toISOString() : null,
    invoice_issued_date_assumed: p.invoiceIssuedDateAssumed ?? null,
    invoice_required_entered_at: p.invoiceRequiredEnteredAt ? p.invoiceRequiredEnteredAt.toISOString() : null,
    paid_on_date: p.paidOnDate ? p.paidOnDate.toISOString() : null,
    payment_method: p.paymentMethod ?? null,
    payment_reference: p.paymentReference ?? null,
    updated_at: new Date().toISOString(),
  };
}
function logEntryToRow(projectId: string, e: ProjectLogEntry) {
  return {
    id: e.id,
    project_id: projectId,
    ts: e.ts.toISOString(),
    actor_user_id: e.actor.userId,
    actor_display_name: e.actor.displayName,
    action_type: e.actionType,
    description: e.description,
    metadata: (e.metadata ?? null) as any,
  };
}
function noteToRow(projectId: string, n: ProjectNote) {
  return {
    id: n.id,
    project_id: projectId,
    ts: n.ts.toISOString(),
    author: n.author,
    author_user_id: n.authorUserId ?? null,
    text: n.text,
    auto: !!n.auto,
  };
}
function shipmentToRow(s: Shipment): any {
  return {
    id: s.id,
    code: s.code,
    mode: s.mode,
    carrier: s.carrier ?? null,
    supplier_id: s.supplierId,
    etd: s.etd.toISOString(),
    eta: s.eta.toISOString(),
    status: s.status,
  };
}
function rowToShipment(row: any): Shipment {
  return {
    id: row.id,
    code: row.code,
    mode: row.mode,
    carrier: row.carrier ?? undefined,
    supplierId: row.supplier_id,
    etd: new Date(row.etd),
    eta: new Date(row.eta),
    status: row.status,
  };
}


// ─────────── Stage helpers ───────────
export interface StagePos {
  pipeline: PipelineId;
  stage: StageId;
  pipelineIndex: number;
  stageIndex: number;
}

export const ALL_STAGES: { pipeline: PipelineId; stage: StageId; title: string; pipelineTitle: string }[] =
  PIPELINES.flatMap((p) => p.stages.map((s) => ({ pipeline: p.id, stage: s.id, title: s.title, pipelineTitle: p.title })));

export function getStagePos(pipeline: PipelineId, stage: StageId): StagePos {
  const pipelineIndex = PIPELINES.findIndex((p) => p.id === pipeline);
  const stageIndex = PIPELINES[pipelineIndex].stages.findIndex((s) => s.id === stage);
  return { pipeline, stage, pipelineIndex, stageIndex };
}

export function getStageTitle(pipeline: PipelineId, stage: StageId): string {
  return PIPELINES.find((p) => p.id === pipeline)?.stages.find((s) => s.id === stage)?.title ?? stage;
}

function forwardStages(pipeline: PipelineId): StageId[] {
  const p = PIPELINES.find((x) => x.id === pipeline)!;
  // Strip parking/terminal sub-stages from the linear forward path.
  const SKIP = new Set<StageId>(["archive", "stalled", "internal"]);
  return p.stages.filter((s) => !SKIP.has(s.id)).map((s) => s.id);
}

export function getNextStage(pipeline: PipelineId, stage: StageId): { pipeline: PipelineId; stage: StageId } | null {
  const stages = forwardStages(pipeline);
  const idx = stages.indexOf(stage);
  if (idx >= 0 && idx < stages.length - 1) {
    return { pipeline, stage: stages[idx + 1] };
  }
  const pi = PIPELINES.findIndex((x) => x.id === pipeline);
  if (pi < PIPELINES.length - 1) {
    const next = PIPELINES[pi + 1];
    const nextStages = forwardStages(next.id);
    return { pipeline: next.id, stage: nextStages[0] };
  }
  return null;
}

export function getPrevStage(pipeline: PipelineId, stage: StageId): { pipeline: PipelineId; stage: StageId } | null {
  const stages = forwardStages(pipeline);
  const idx = stages.indexOf(stage);
  if (idx > 0) return { pipeline, stage: stages[idx - 1] };
  const pi = PIPELINES.findIndex((x) => x.id === pipeline);
  if (pi > 0) {
    const prev = PIPELINES[pi - 1];
    const prevStages = forwardStages(prev.id);
    return { pipeline: prev.id, stage: prevStages[prevStages.length - 1] };
  }
  return null;
}

// ─────────── Validation ───────────
export interface MoveValidation {
  ok: boolean;
  missing: ("detailSummary" | "supplier" | "shippingMode")[];
}

/** Forward order of stages across all pipelines. Parking sub-stages
 *  (stalled, internal, archive) are excluded from the linear flow. */
export const STAGE_ORDER: StageId[] = [
  "sourcing", "proposal", "quote", "pending",
  "client_artwork", "artwork_creation", "proof",
  "purchasing",
  "production", "ready_to_ship",
  "shipment_assigned", "arrived",
  "invoice_required", "invoiced",
  "completed",
  // legacy IDs kept in the order so historical log entries still rank correctly
  "confirming", "design", "preproduction", "in_production", "shipment_required", "paid",
];

/** Returns true if moving from `from` to `to` advances the project (toward Production/Shipping/Finance/Completed). */
export function isForwardMove(from: StageId, to: StageId): boolean {
  if (to === "archive") return false; // exit state — never "forward" for warning purposes
  const fi = STAGE_ORDER.indexOf(from);
  const ti = STAGE_ORDER.indexOf(to);
  if (fi < 0 || ti < 0) return false;
  return ti > fi;
}

export function validateMove(project: Project, target: { pipeline: PipelineId; stage: StageId }): MoveValidation {
  // Gate: anything from "purchasing" onwards (Purchasing, Production, Shipping,
  // Finance) requires the canonical confirming-fields trio.
  if (target.stage === "archive") return { ok: true, missing: [] };
  const targetIdx = STAGE_ORDER.indexOf(target.stage);
  const gateIdx = STAGE_ORDER.indexOf("proof");
  if (targetIdx <= gateIdx) return { ok: true, missing: [] };

  const missing: MoveValidation["missing"] = [];
  if (!project.detailSummary || !project.detailSummary.trim()) missing.push("detailSummary");
  if (!project.supplierId) missing.push("supplier");
  if (!project.shippingMode) missing.push("shippingMode");
  return { ok: missing.length === 0, missing };
}

// ─────────── Store ───────────
interface MoveResult {
  blocked?: { reason: "missing-fields"; missing: MoveValidation["missing"] };
  ok?: boolean;
}

export interface NewShipmentInput {
  mode: ShippingMode;
  code: string;
  carrier?: "DHL" | "FedEx";
  etd: Date;
  eta: Date;
  supplierId: string;
}

interface PipelineStoreCtx {
  projects: Project[];
  trashedProjects: Project[];
  archivedProjects: Project[];
  shipments: Shipment[];
  suppliers: Supplier[];
  loading: boolean;
  moveCard: (cardId: string, target: { pipeline: PipelineId; stage: StageId }) => Promise<MoveResult>;
  updateProject: (id: string, patch: Partial<Project>) => Promise<void>;
  renameProject: (currentName: string, newName: string) => Promise<{ count: number }>;
  addNote: (projectId: string, text: string, author?: string) => Promise<void>;
  updateNote: (projectId: string, noteId: string, newText: string) => Promise<void>;
  removeNote: (projectId: string, noteId: string) => Promise<void>;
  restoreNote: (projectId: string, note: ProjectNote) => Promise<void>;
  addLineItem: (projectId: string, item: LineItem) => Promise<void>;
  updateLineItem: (projectId: string, index: number, item: LineItem) => Promise<void>;
  removeLineItem: (projectId: string, index: number) => Promise<void>;
  duplicateProject: (projectId: string) => Promise<Project | null>;
  createProject: (input: { customer: string; projectName: string; detailSummary?: string; pointPerson?: string; initialPipeline?: PipelineId; initialStage?: StageId; deadlineDate?: Date; buyerId?: string | null }) => Promise<Project | null>;
  toggleFlag: (projectId: string) => Promise<void>;
  softDeleteProject: (projectId: string) => Promise<{ restoredFrom: { pipeline: PipelineId; stage: StageId } } | null>;
  restoreProject: (projectId: string) => Promise<{ pipeline: PipelineId; stage: StageId } | null>;
  hardDeleteProject: (projectId: string) => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
  addSupplier: (input: { name: string; country: string; defaultShippingMode: ShippingMode }) => Promise<Supplier>;
  isQuoteNumberDuplicate: (number: string, exceptProjectId: string) => boolean;
  isPONumberDuplicate: (number: string, exceptProjectId: string) => boolean;
  isInvoiceNumberDuplicate: (number: string, exceptProjectId: string) => boolean;
  assignToShipment: (projectId: string, shipmentId: string) => Promise<void>;
  createShipment: (input: NewShipmentInput) => Promise<Shipment | null>;
  updateShipment: (id: string, patch: Partial<Shipment>) => Promise<void>;
  markShipmentDelivered: (shipmentId: string) => Promise<{ count: number }>;
  pulsePipeline: PipelineId | null;
  triggerPulse: (id: PipelineId) => void;
}

const Ctx = createContext<PipelineStoreCtx | null>(null);

const FAILURE_TOAST = "Couldn't save change — please try again";

export const PipelineStoreProvider = ({ children }: { children: ReactNode }) => {
  // Phase 3b: Supabase is the source of truth. No in-memory seed fallback.
  // Mutations apply optimistically and roll back on failure with a toast.
  const [projects, setProjects] = useState<Project[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>(() => SUPPLIERS.map((s) => ({ ...s })));
  const [loading, setLoading] = useState(true);
  const projectsRef = useRef<Project[]>([]);
  projectsRef.current = projects;
  const shipmentsRef = useRef<Shipment[]>([]);
  shipmentsRef.current = shipments;
  const currentUser = useCurrentUser();
  const userRef = useRef(currentUser); userRef.current = currentUser;
  const suppliersRef = useRef(suppliers); suppliersRef.current = suppliers;
  const [pulsePipeline, setPulsePipeline] = useState<PipelineId | null>(null);
  const pulseTimer = useRef<number | null>(null);

  // ── Initial fetch from Supabase + realtime subscription ───────────────
  // SCALING NOTE: chatty fan-out, fine to ~5k projects, revisit when
  // growth requires pagination or scoped subscriptions.
  // FLICKER NOTE: realtime debounced; rows are keyed by id so React
  // reconciles in-place — no card disappearance during refetch.
  useEffect(() => {
    let mounted = true;
    let refetchTimer: number | null = null;

    const refetchNow = async () => {
      const [pj, sh, nt, lg, li] = await Promise.all([
        supabase.from("projects").select("*"),
        supabase.from("shipments").select("*"),
        supabase.from("project_notes").select("*").order("ts"),
        supabase.from("project_log_entries").select("*").order("ts"),
        supabase.from("line_items").select("*").order("position"),
      ]);
      if (!mounted) return;
      const notesByProj = new Map<string, ProjectNote[]>();
      for (const r of (nt.data ?? [])) {
        const arr = notesByProj.get(r.project_id) ?? [];
        arr.push({
          id: r.id, ts: new Date(r.ts), author: r.author,
          authorUserId: r.author_user_id ?? undefined, text: r.text, auto: r.auto,
          updatedAt: r.updated_at ? new Date(r.updated_at) : undefined,
        });
        notesByProj.set(r.project_id, arr);
      }
      const logByProj = new Map<string, ProjectLogEntry[]>();
      for (const r of (lg.data ?? [])) {
        const arr = logByProj.get(r.project_id) ?? [];
        arr.push({
          id: r.id, ts: new Date(r.ts),
          actor: { userId: r.actor_user_id, displayName: r.actor_display_name },
          actionType: r.action_type as ProjectLogActionType,
          description: r.description,
          metadata: (r.metadata ?? undefined) as any,
        });
        logByProj.set(r.project_id, arr);
      }
      const itemsByProj = new Map<string, LineItem[]>();
      for (const r of (li.data ?? [])) {
        const arr = itemsByProj.get(r.project_id) ?? [];
        arr.push({
          qty: Number(r.qty), description: r.description,
          unitPrice: r.unit_price ?? undefined,
          total: r.total ?? undefined,
          productId: r.product_id ?? undefined,
        });
        itemsByProj.set(r.project_id, arr);
      }
      if (pj.data) {
        setProjects(pj.data.map((row) => rowToProject(row, notesByProj, logByProj, itemsByProj)));
      }
      if (sh.data) setShipments(sh.data.map(rowToShipment));
      setLoading(false);
    };

    const refetch = () => {
      if (refetchTimer) window.clearTimeout(refetchTimer);
      refetchTimer = window.setTimeout(() => { refetchNow(); }, 150);
    };

    refetchNow();

    const channel = supabase
      .channel("pipeline-store")
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, refetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "shipments" }, refetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "project_notes" }, refetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "project_log_entries" }, refetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "line_items" }, refetch)
      .subscribe();

    return () => {
      mounted = false;
      if (refetchTimer) window.clearTimeout(refetchTimer);
      supabase.removeChannel(channel);
    };
  }, []);

  const triggerPulse = useCallback((id: PipelineId) => {
    setPulsePipeline(id);
    if (pulseTimer.current) window.clearTimeout(pulseTimer.current);
    pulseTimer.current = window.setTimeout(() => setPulsePipeline(null), 900);
  }, []);

  const touch = (p: Project): Project => ({ ...p, updatedAt: new Date() });

  // ── Optimistic mutation core ─────────────────────────────────────────
  // Apply optimistic in-memory change; await Supabase project upsert + log
  // insert in one chain; rollback both the local state and (if log failed)
  // the project row on error, then toast.
  const commitProjectChange = async (
    optimistic: Project,
    logEntries: ProjectLogEntry[],
  ): Promise<boolean> => {
    const snapshot = projectsRef.current;
    const prevRow = snapshot.find((p) => p.id === optimistic.id);
    setProjects((prev) => {
      const exists = prev.some((p) => p.id === optimistic.id);
      return exists ? prev.map((p) => (p.id === optimistic.id ? optimistic : p)) : [optimistic, ...prev];
    });
    const { error: pErr } = await supabase.from("projects").upsert(projectToRow(optimistic));
    if (pErr) {
      console.error("[store] commit project failed", optimistic.id, pErr.message);
      setProjects(snapshot);
      toast.error(FAILURE_TOAST);
      return false;
    }
    if (logEntries.length) {
      const { error: lErr } = await supabase
        .from("project_log_entries")
        .insert(logEntries.map((e) => logEntryToRow(optimistic.id, e)));
      if (lErr) {
        console.error("[store] commit log failed", optimistic.id, lErr.message);
        // Roll back the project row to keep audit trail consistent.
        setProjects(snapshot);
        if (prevRow) {
          await supabase.from("projects").upsert(projectToRow(prevRow));
        }
        toast.error(FAILURE_TOAST);
        return false;
      }
    }
    return true;
  };

  const moveCard = useCallback<PipelineStoreCtx["moveCard"]>(async (cardId, target) => {
    const proj = projectsRef.current.find((p) => p.id === cardId);
    if (!proj) return { ok: false };
    // Note: validateMove() is still exported and used by callers (Index.tsx) to
    // surface a non-blocking warning toast on forward moves with missing fields.
    // The store itself no longer blocks the move — softening per product decision.

    const u = userRef.current;
    const patch: Partial<Project> = { pipeline: target.pipeline, stage: target.stage };
    if (target.pipeline === "shipping" && target.stage === "shipment_required") patch.shipmentId = undefined;
    // NOTE: Q#, PO#, INV# are NEVER auto-generated by stage transitions.
    // They reflect real artifacts and are filled in manually by the team.
    if (target.pipeline === "finance" && target.stage === "invoice_required" && !proj.invoiceRequiredEnteredAt) {
      patch.invoiceRequiredEnteredAt = new Date();
    }
    if (target.pipeline === "finance" && target.stage === "invoiced" && !proj.invoiceIssuedDate) {
      patch.invoiceIssuedDate = new Date();
      patch.invoiceIssuedDateAssumed = true;
    }
    const fromLabel = pipelineStageLabel(proj.pipeline, proj.stage);
    const toLabel = pipelineStageLabel(target.pipeline, target.stage);
    // "Mark as paid" = transition into the terminal Completed pipeline.
    // The legacy finance/paid combination is also kept as a recognized
    // payment marker for any historical rows the migration missed.
    const isPaid =
      (target.pipeline === "completed" && target.stage === "completed") ||
      (target.pipeline === "finance" && target.stage === "paid");
    const isArchive = target.pipeline === "sales" && target.stage === "archive";
    const wasArchive = proj.pipeline === "sales" && proj.stage === "archive";
    let next = touch({ ...proj, ...patch });
    let res;
    if (isPaid) {
      res = appendLog(next, { actor: actorOf(u), actionType: "mark_paid",
        description: `${u.shortName} marked this paid (transitioned to Completed)`,
        metadata: { fromPipeline: proj.pipeline, fromStage: proj.stage, toPipeline: target.pipeline, toStage: target.stage } });
    } else if (isArchive) {
      res = appendLog(next, { actor: actorOf(u), actionType: "archive", description: `${u.shortName} archived this`,
        metadata: { fromPipeline: proj.pipeline, fromStage: proj.stage } });
    } else if (wasArchive) {
      res = appendLog(next, { actor: actorOf(u), actionType: "unarchive", description: `${u.shortName} restored this from archive`,
        metadata: { toPipeline: target.pipeline, toStage: target.stage } });
    } else {
      res = appendLog(next, { actor: actorOf(u), actionType: "stage_change",
        description: `${u.shortName} moved this from ${fromLabel} to ${toLabel}`,
        metadata: { fromPipeline: proj.pipeline, fromStage: proj.stage, toPipeline: target.pipeline, toStage: target.stage } });
    }
    const ok = await commitProjectChange(res.project, [res.entry]);
    return { ok };
  }, []);

  const updateProject = useCallback(async (id: string, patch: Partial<Project>) => {
    const proj = projectsRef.current.find((p) => p.id === id);
    if (!proj) return;
    const u = userRef.current;
    // Auto-clear buyer when customer changes (the buyer no longer belongs
    // to the new customer). Skipped if the caller already set buyerId
    // explicitly in the same patch.
    let effectivePatch = patch;
    if (
      typeof patch.customer === "string" &&
      patch.customer !== proj.customer &&
      proj.buyerId &&
      !("buyerId" in patch)
    ) {
      effectivePatch = { ...patch, buyerId: null };
      // Defer toast to next tick so callers can compose their own
      // success toasts first.
      setTimeout(() => {
        toast.info("Buyer was cleared because the customer changed");
      }, 0);
    }
    const entries = buildFieldEditEntries(proj, effectivePatch, u, suppliersRef.current);
    let next = touch({ ...proj, ...effectivePatch });
    const newEntries: ProjectLogEntry[] = [];
    for (const e of entries) {
      const r = appendLog(next, e);
      next = r.project;
      newEntries.push(r.entry);
    }
    await commitProjectChange(next, newEntries);
  }, []);

  const renameProject = useCallback(async (currentName: string, newName: string) => {
    const targets = projectsRef.current.filter((p) => p.projectName === currentName);
    const u = userRef.current;
    let count = 0;
    for (const p of targets) {
      const r = appendLog(touch({ ...p, projectName: newName }), {
        actor: actorOf(u), actionType: "field_edit",
        description: `${u.shortName} changed project name from ${currentName} to ${newName}`,
        metadata: { field: "projectName", fromValue: currentName, toValue: newName },
      });
      const ok = await commitProjectChange(r.project, [r.entry]);
      if (ok) count += 1;
    }
    return { count };
  }, []);

  const addNote = useCallback(async (projectId: string, text: string) => {
    const proj = projectsRef.current.find((p) => p.id === projectId);
    if (!proj) return;
    const u = userRef.current;
    const note: ProjectNote = {
      id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      ts: new Date(), author: u.fullName, authorUserId: u.userId, text,
    };
    const next = touch({ ...proj, notes: [...(proj.notes ?? []), note] });
    const r = appendLog(next, { actor: actorOf(u), actionType: "note_added", description: `${u.shortName} added a note` });

    // Snapshot and apply optimistic
    const snapshot = projectsRef.current;
    setProjects((prev) => prev.map((p) => (p.id === projectId ? r.project : p)));
    const { error: nErr } = await supabase.from("project_notes").insert(noteToRow(projectId, note));
    if (nErr) {
      setProjects(snapshot);
      toast.error(FAILURE_TOAST);
      return;
    }
    const { error: pErr } = await supabase.from("projects").upsert(projectToRow(r.project));
    if (pErr) {
      setProjects(snapshot);
      await supabase.from("project_notes").delete().eq("id", note.id);
      toast.error(FAILURE_TOAST);
      return;
    }
    const { error: lErr } = await supabase.from("project_log_entries").insert(logEntryToRow(projectId, r.entry));
    if (lErr) {
      setProjects(snapshot);
      await supabase.from("project_notes").delete().eq("id", note.id);
      await supabase.from("projects").upsert(projectToRow(proj));
      toast.error(FAILURE_TOAST);
    }
  }, []);

  const updateNote = useCallback(async (projectId: string, noteId: string, newText: string) => {
    const proj = projectsRef.current.find((p) => p.id === projectId); if (!proj) return;
    const idx = (proj.notes ?? []).findIndex((n) => n.id === noteId);
    if (idx < 0) return;
    const oldNote = proj.notes![idx];
    if (oldNote.text === newText) return;
    const u = userRef.current;
    const updatedNote: ProjectNote = { ...oldNote, text: newText, updatedAt: new Date() };
    const nextNotes = [...proj.notes!]; nextNotes[idx] = updatedNote;
    const next = touch({ ...proj, notes: nextNotes });
    const r = appendLog(next, {
      actor: actorOf(u), actionType: "note_edited",
      description: `${u.shortName} edited a note`,
      metadata: { noteId, oldLength: oldNote.text.length, newLength: newText.length } as any,
    });
    const snapshot = projectsRef.current;
    setProjects((prev) => prev.map((p) => (p.id === projectId ? r.project : p)));
    const { error: nErr } = await supabase.from("project_notes").update({ text: newText }).eq("id", noteId);
    if (nErr) { setProjects(snapshot); toast.error(FAILURE_TOAST); return; }
    const { error: pErr } = await supabase.from("projects").upsert(projectToRow(r.project));
    if (pErr) { setProjects(snapshot); toast.error(FAILURE_TOAST); return; }
    const { error: lErr } = await supabase.from("project_log_entries").insert(logEntryToRow(projectId, r.entry));
    if (lErr) { setProjects(snapshot); toast.error(FAILURE_TOAST); }
  }, []);

  const removeNote = useCallback(async (projectId: string, noteId: string) => {
    const proj = projectsRef.current.find((p) => p.id === projectId); if (!proj) return;
    const idx = (proj.notes ?? []).findIndex((n) => n.id === noteId);
    if (idx < 0) return;
    const removed = proj.notes![idx];
    const u = userRef.current;
    const nextNotes = proj.notes!.filter((n) => n.id !== noteId);
    const next = touch({ ...proj, notes: nextNotes });
    const preview = removed.text.length > 50 ? removed.text.slice(0, 50) + "…" : removed.text;
    const r = appendLog(next, {
      actor: actorOf(u), actionType: "note_deleted",
      description: `${u.shortName} deleted a note`,
      metadata: { noteId, deletedTextPreview: preview } as any,
    });
    const snapshot = projectsRef.current;
    setProjects((prev) => prev.map((p) => (p.id === projectId ? r.project : p)));
    const { error: nErr } = await supabase.from("project_notes").delete().eq("id", noteId);
    if (nErr) { setProjects(snapshot); toast.error(FAILURE_TOAST); return; }
    const { error: pErr } = await supabase.from("projects").upsert(projectToRow(r.project));
    if (pErr) { setProjects(snapshot); toast.error(FAILURE_TOAST); return; }
    const { error: lErr } = await supabase.from("project_log_entries").insert(logEntryToRow(projectId, r.entry));
    if (lErr) { setProjects(snapshot); toast.error(FAILURE_TOAST); }
  }, []);

  /** Re-insert a previously-deleted note with original id/ts/author. Does NOT
   *  write an audit log entry — undo brings the note back without rewriting
   *  history; the original note_deleted entry stays as factual record. */
  const restoreNote = useCallback(async (projectId: string, note: ProjectNote) => {
    const proj = projectsRef.current.find((p) => p.id === projectId); if (!proj) return;
    if ((proj.notes ?? []).some((n) => n.id === note.id)) return;
    const nextNotes = [...(proj.notes ?? []), note].sort((a, b) => a.ts.getTime() - b.ts.getTime());
    const optimistic = { ...proj, notes: nextNotes };
    const snapshot = projectsRef.current;
    setProjects((prev) => prev.map((p) => (p.id === projectId ? optimistic : p)));
    const { error } = await supabase.from("project_notes").insert(noteToRow(projectId, note));
    if (error) { setProjects(snapshot); toast.error(FAILURE_TOAST); }
  }, []);

  const persistLineItemsAndCommit = async (
    projectId: string, items: LineItem[], optimistic: Project, entry: ProjectLogEntry,
  ) => {
    const snapshot = projectsRef.current;
    setProjects((prev) => prev.map((p) => (p.id === projectId ? optimistic : p)));
    // Replace strategy: delete + reinsert.
    const { error: dErr } = await supabase.from("line_items").delete().eq("project_id", projectId);
    if (dErr) {
      setProjects(snapshot); toast.error(FAILURE_TOAST); return;
    }
    if (items.length) {
      const rows = items.map((li, i) => ({
        project_id: projectId, position: i, qty: li.qty, description: li.description,
        unit_price: li.unitPrice ?? null, total: li.total ?? null, product_id: li.productId ?? null,
      }));
      const { error: iErr } = await supabase.from("line_items").insert(rows);
      if (iErr) { setProjects(snapshot); toast.error(FAILURE_TOAST); return; }
    }
    const { error: pErr } = await supabase.from("projects").upsert(projectToRow(optimistic));
    if (pErr) { setProjects(snapshot); toast.error(FAILURE_TOAST); return; }
    const { error: lErr } = await supabase.from("project_log_entries").insert(logEntryToRow(projectId, entry));
    if (lErr) { setProjects(snapshot); toast.error(FAILURE_TOAST); }
  };

  const addLineItem = useCallback(async (projectId: string, item: LineItem) => {
    const proj = projectsRef.current.find((p) => p.id === projectId); if (!proj) return;
    const items = [...(proj.lineItems ?? []), item];
    const next = touch({ ...proj, lineItems: items });
    const u = userRef.current;
    const r = appendLog(next, { actor: actorOf(u), actionType: "line_item_change",
      description: `${u.shortName} added line item ${item.qty} × ${item.description}` });
    await persistLineItemsAndCommit(projectId, items, r.project, r.entry);
  }, []);

  const updateLineItem = useCallback(async (projectId: string, index: number, item: LineItem) => {
    const proj = projectsRef.current.find((p) => p.id === projectId); if (!proj) return;
    const items = [...(proj.lineItems ?? [])];
    if (index < 0 || index >= items.length) return;
    items[index] = item;
    const next = touch({ ...proj, lineItems: items });
    const u = userRef.current;
    const r = appendLog(next, { actor: actorOf(u), actionType: "line_item_change",
      description: `${u.shortName} edited line item ${item.qty} × ${item.description}` });
    await persistLineItemsAndCommit(projectId, items, r.project, r.entry);
  }, []);

  const removeLineItem = useCallback(async (projectId: string, index: number) => {
    const proj = projectsRef.current.find((p) => p.id === projectId); if (!proj) return;
    const items = [...(proj.lineItems ?? [])];
    if (index < 0 || index >= items.length) return;
    const removed = items[index];
    items.splice(index, 1);
    const next = touch({ ...proj, lineItems: items });
    const u = userRef.current;
    const r = appendLog(next, { actor: actorOf(u), actionType: "line_item_change",
      description: `${u.shortName} removed line item ${removed.qty} × ${removed.description}` });
    await persistLineItemsAndCommit(projectId, items, r.project, r.entry);
  }, []);

  const duplicateProject = useCallback(async (projectId: string): Promise<Project | null> => {
    const orig = projectsRef.current.find((p) => p.id === projectId);
    if (!orig) return null;
    const u = userRef.current;
    let copy: Project = {
      ...orig,
      id: `prj-dup-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      projectName: `${orig.projectName} (Copy)`,
      quoteNumber: undefined, poNumber: undefined, invoiceNumber: undefined,
      shipmentId: undefined, notes: undefined, lineItems: undefined, log: undefined,
      pipeline: orig.pipeline, stage: orig.stage, flagged: false,
      deletedAt: undefined, deletedFromPipeline: undefined, deletedFromStage: undefined,
      createdAt: new Date(), updatedAt: undefined,
    };
    const r = appendLog(copy, { actor: actorOf(u), actionType: "project_created",
      description: `${u.shortName} duplicated this from ${orig.projectName}` });
    const ok = await commitProjectChange(r.project, [r.entry]);
    return ok ? r.project : null;
  }, []);

  const createProject = useCallback<PipelineStoreCtx["createProject"]>(async (input) => {
    const u = userRef.current;
    const initialPipeline: PipelineId = input.initialPipeline ?? "sales";
    const initialStage: StageId = input.initialStage ?? "sourcing";
    const userSetDeadline = !!input.deadlineDate;
    const deadlineDate = input.deadlineDate ?? null;
    const deadlineLabel = deadlineDate
      ? deadlineDate.toLocaleDateString(undefined, { day: "numeric", month: "short" })
      : undefined;
    let newProj: Project = {
      id: `prj-new-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      customer: input.customer,
      buyerId: input.buyerId ?? null,
      projectName: input.projectName,
      detailSummary: input.detailSummary,
      pointPerson: input.pointPerson ?? "AV",
      pipeline: initialPipeline, stage: initialStage,
      deadline: deadlineLabel ?? "—",
      deadlineDate,
      value: 0, orderType: "New", priority: "Standard",
      createdAt: new Date(),
      paymentTerms: "Net 30",
      paymentTermsInherited: true,
    };
    const pipelineTitle = PIPELINES.find((p) => p.id === initialPipeline)?.title ?? initialPipeline;
    const stageTitle = getStageTitle(initialPipeline, initialStage);
    const desc = userSetDeadline && deadlineLabel
      ? `${u.shortName} created this project in ${pipelineTitle} · ${stageTitle} with deadline ${deadlineLabel}`
      : `${u.shortName} created this project in ${pipelineTitle} · ${stageTitle}`;
    const r = appendLog(newProj, { actor: actorOf(u), actionType: "project_created", description: desc });
    const ok = await commitProjectChange(r.project, [r.entry]);
    return ok ? r.project : null;
  }, []);

  const toggleFlag = useCallback<PipelineStoreCtx["toggleFlag"]>(async (projectId) => {
    const proj = projectsRef.current.find((p) => p.id === projectId); if (!proj) return;
    const u = userRef.current;
    const next = touch({ ...proj, flagged: !proj.flagged });
    const r = appendLog(next, { actor: actorOf(u), actionType: "flag_toggle",
      description: !proj.flagged ? `${u.shortName} flagged this` : `${u.shortName} unflagged this` });
    await commitProjectChange(r.project, [r.entry]);
  }, []);

  const softDeleteProject = useCallback<PipelineStoreCtx["softDeleteProject"]>(async (projectId) => {
    const orig = projectsRef.current.find((p) => p.id === projectId && !p.deletedAt);
    if (!orig) return null;
    const restoredFrom = { pipeline: orig.pipeline, stage: orig.stage };
    const u = userRef.current;
    const r = appendLog(
      { ...orig, deletedAt: new Date(), deletedFromPipeline: orig.pipeline, deletedFromStage: orig.stage },
      { actor: actorOf(u), actionType: "trash", description: `${u.shortName} moved this to Trash` },
    );
    const ok = await commitProjectChange(r.project, [r.entry]);
    return ok ? { restoredFrom } : null;
  }, []);

  const restoreProject = useCallback<PipelineStoreCtx["restoreProject"]>(async (projectId) => {
    const orig = projectsRef.current.find((p) => p.id === projectId && p.deletedAt);
    if (!orig) return null;
    const knownStages: StageId[] = PIPELINES.flatMap((pp) => pp.stages.map((s) => s.id));
    const targetPipeline: PipelineId = orig.deletedFromPipeline ?? orig.pipeline ?? "sales";
    const fallbackStage: Record<PipelineId, StageId> = {
      sales: "quote", design: "artwork_creation",
      purchasing: "purchasing", production: "production",
      shipping: "shipment_assigned", finance: "invoice_required",
      completed: "completed",
      operations: "production", // legacy alias
    };
    const targetStage: StageId =
      orig.deletedFromStage && knownStages.includes(orig.deletedFromStage)
        ? orig.deletedFromStage : fallbackStage[targetPipeline];
    const u = userRef.current;
    const r = appendLog(
      { ...orig, pipeline: targetPipeline, stage: targetStage,
        deletedAt: undefined, deletedFromPipeline: undefined, deletedFromStage: undefined },
      { actor: actorOf(u), actionType: "restore", description: `${u.shortName} restored this from Trash` },
    );
    const ok = await commitProjectChange(r.project, [r.entry]);
    return ok ? { pipeline: targetPipeline, stage: targetStage } : null;
  }, []);

  const hardDeleteProject = useCallback(async (projectId: string) => {
    const snapshot = projectsRef.current;
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
    const { error } = await supabase.from("projects").delete().eq("id", projectId);
    if (error) {
      console.error("[store] hardDelete", projectId, error.message);
      setProjects(snapshot);
      toast.error(FAILURE_TOAST);
    }
  }, []);

  const deleteProject = useCallback(async (projectId: string) => {
    await softDeleteProject(projectId);
  }, [softDeleteProject]);

  const addSupplier = useCallback(async (input: { name: string; country: string; defaultShippingMode: ShippingMode }): Promise<Supplier> => {
    // In-memory for now (master data has its own hook). Phase 3b keeps this
    // local; persistence is handled by useMasterData for first-class flows.
    const sup: Supplier = {
      id: `sup-${Date.now()}`, name: input.name, country: input.country,
      defaultShippingMode: input.defaultShippingMode, contact: "—",
    };
    setSuppliers((prev) => [...prev, sup]);
    return sup;
  }, []);

  const isQuoteNumberDuplicate = useCallback((n: string, exceptId: string) =>
    projects.some((p) => p.id !== exceptId && p.quoteNumber === n), [projects]);
  const isPONumberDuplicate = useCallback((n: string, exceptId: string) =>
    projects.some((p) => p.id !== exceptId && p.poNumber === n), [projects]);
  const isInvoiceNumberDuplicate = useCallback((n: string, exceptId: string) =>
    projects.some((p) => p.id !== exceptId && p.invoiceNumber === n), [projects]);

  const assignToShipment = useCallback(async (projectId: string, shipmentId: string) => {
    const ship = shipmentsRef.current.find((s) => s.id === shipmentId);
    const proj = projectsRef.current.find((p) => p.id === projectId);
    if (!ship || !proj) return;
    const u = userRef.current;
    const next = touch({ ...proj, shipmentId, pipeline: "shipping" as const, stage: "shipment_assigned" as const, shippingMode: ship.mode });
    const r = appendLog(next, { actor: actorOf(u), actionType: "stage_change",
      description: `${u.shortName} assigned this to shipment ${ship.code}`,
      metadata: { fromPipeline: proj.pipeline, fromStage: proj.stage, toPipeline: "shipping", toStage: "shipment_assigned" } });
    await commitProjectChange(r.project, [r.entry]);
  }, []);

  const createShipment = useCallback(async (input: NewShipmentInput): Promise<Shipment | null> => {
    const newShip: Shipment = {
      id: `ship-${Date.now()}`, code: input.code, mode: input.mode,
      carrier: input.mode === "Air" ? (input.carrier ?? "DHL") : undefined,
      supplierId: input.supplierId, etd: input.etd, eta: input.eta, status: "Booked",
    };
    const snapshot = shipmentsRef.current;
    setShipments((prev) => [...prev, newShip]);
    const { error } = await supabase.from("shipments").insert(shipmentToRow(newShip));
    if (error) {
      setShipments(snapshot);
      toast.error(FAILURE_TOAST);
      return null;
    }
    return newShip;
  }, []);

  const updateShipment = useCallback(async (id: string, patch: Partial<Shipment>) => {
    const cur = shipmentsRef.current.find((s) => s.id === id);
    if (!cur) return;
    const snapshot = shipmentsRef.current;
    const merged: Shipment = { ...cur, ...patch };
    setShipments((prev) => prev.map((s) => (s.id === id ? merged : s)));
    setProjects((prev) => prev.map((p) => (p.shipmentId === id ? touch(p) : p)));
    const { error } = await supabase.from("shipments").update(shipmentToRow(merged)).eq("id", id);
    if (error) {
      setShipments(snapshot);
      toast.error(FAILURE_TOAST);
    }
  }, []);

  const markShipmentDelivered = useCallback(async (shipmentId: string) => {
    const u = userRef.current;
    const subs = projectsRef.current.filter((p) => p.shipmentId === shipmentId && p.pipeline === "shipping");
    let count = 0;
    for (const p of subs) {
      const patch: Partial<Project> = { pipeline: "finance", stage: "invoice_required" };
      // INV# is filled in manually when an invoice actually exists — not auto-generated.
      const next = touch({ ...p, ...patch });
      const r = appendLog(next, { actor: actorOf(u), actionType: "stage_change",
        description: `${u.shortName} marked shipment delivered`,
        metadata: { fromPipeline: p.pipeline, fromStage: p.stage, toPipeline: "finance", toStage: "invoice_required" } });
      const ok = await commitProjectChange(r.project, [r.entry]);
      if (ok) count += 1;
    }
    const snapshot = shipmentsRef.current;
    setShipments((prev) => prev.map((s) => s.id === shipmentId ? { ...s, status: "Delivered" } : s));
    const { error } = await supabase.from("shipments").update({ status: "Delivered" }).eq("id", shipmentId);
    if (error) {
      setShipments(snapshot);
      toast.error(FAILURE_TOAST);
    }
    return { count };
  }, []);

  const liveProjects = useMemo(() => projects.filter((p) => !p.deletedAt), [projects]);
  const trashedProjects = useMemo(
    () => projects.filter((p) => !!p.deletedAt)
      .sort((a, b) => (b.deletedAt!.getTime() - a.deletedAt!.getTime())),
    [projects],
  );
  const archivedProjects = useMemo(
    () => liveProjects.filter((p) => p.pipeline === "sales" && p.stage === "archive"),
    [liveProjects],
  );

  const value = useMemo<PipelineStoreCtx>(() => ({
    projects: liveProjects, trashedProjects, archivedProjects, shipments, suppliers, loading,
    moveCard, updateProject, renameProject,
    addNote, updateNote, removeNote, restoreNote,
    addLineItem, updateLineItem, removeLineItem,
    duplicateProject, createProject, toggleFlag,
    softDeleteProject, restoreProject, hardDeleteProject, deleteProject,
    addSupplier,
    isQuoteNumberDuplicate, isPONumberDuplicate, isInvoiceNumberDuplicate,
    assignToShipment, createShipment, updateShipment, markShipmentDelivered,
    pulsePipeline, triggerPulse,
  }), [liveProjects, trashedProjects, archivedProjects, shipments, suppliers, loading, moveCard, updateProject, renameProject, addNote, updateNote, removeNote, restoreNote, addLineItem, updateLineItem, removeLineItem, duplicateProject, createProject, toggleFlag, softDeleteProject, restoreProject, hardDeleteProject, deleteProject, addSupplier, isQuoteNumberDuplicate, isPONumberDuplicate, isInvoiceNumberDuplicate, assignToShipment, createShipment, updateShipment, markShipmentDelivered, pulsePipeline, triggerPulse]);


  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const usePipelineStore = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePipelineStore must be used inside PipelineStoreProvider");
  return ctx;
};
