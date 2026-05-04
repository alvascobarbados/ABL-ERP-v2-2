import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from "react";
import {
  PIPELINES, PipelineId, StageId, Project, Shipment, Supplier, ProjectNote, LineItem,
  ProjectLogEntry, ProjectLogActionType,
  SHIPMENTS as SEED_SHIPMENTS, SUPPLIERS, ShippingMode,
} from "@/data/pipelines";
import { ABL_PROJECTS as SEED_PROJECTS } from "@/data/abl-projects";
import { useCurrentUser, SYSTEM_CURRENT_USER, type CurrentUser } from "./useCurrentUser";
import { supabase } from "@/integrations/supabase/client";

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
  contactPerson: "contact",
  pointPerson: "sales rep",
  deadline: "deadline",
  deadlineDate: "deadline",
  value: "amount",
  quoteNumber: "Q#",
  poNumber: "PO#",
  invoiceNumber: "INV#",
  paymentTerms: "payment terms",
  invoiceIssuedDate: "invoice issued date",
};

const SUPPRESSED_FIELDS = new Set<keyof Project>([
  "updatedAt", "createdAt", "log", "notes", "lineItems",
  "pipeline", "stage", "flagged",
  "deletedAt", "deletedFromPipeline", "deletedFromStage",
  "invoiceRequiredEnteredAt", "invoiceIssuedDateAssumed",
  "paymentTermsInherited", "paymentTermsCustomDays",
  "paidOnDate", "paymentMethod", "paymentReference",
  "salesShippingLabel",
]);

function fmtVal(field: keyof Project, val: unknown, suppliers: Supplier[]): string {
  if (val == null || val === "") return "—";
  if (field === "supplierId") {
    return suppliers.find((s) => s.id === val)?.name ?? String(val);
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
const dateFields: (keyof Project)[] = [
  "createdAt", "updatedAt", "deadlineDate", "deletedAt",
  "invoiceIssuedDate", "invoiceRequiredEnteredAt", "paidOnDate",
];
function rowToProject(row: any, notesByProj: Map<string, ProjectNote[]>, logByProj: Map<string, ProjectLogEntry[]>, itemsByProj: Map<string, LineItem[]>): Project {
  const p: Project = {
    id: row.id,
    customer: row.customer,
    contactPerson: row.contact_person ?? undefined,
    pointPerson: row.point_person,
    projectName: row.project_name,
    detailSummary: row.detail_summary ?? undefined,
    supplierId: row.supplier_id ?? undefined,
    supplierLabel: row.supplier_label ?? undefined,
    shippingMode: row.shipping_mode ?? undefined,
    salesShippingLabel: row.sales_shipping_label ?? undefined,
    shipmentId: row.shipment_id ?? undefined,
    trackingRef: row.tracking_ref ?? undefined,
    pipeline: row.pipeline_id,
    stage: row.stage_id,
    deadline: row.deadline,
    deadlineDate: new Date(row.deadline_date),
    value: Number(row.value),
    orderType: row.order_type,
    priority: row.priority,
    tag: row.tag ?? undefined,
    quoteNumber: row.quote_number ?? undefined,
    poNumber: row.po_number ?? undefined,
    invoiceNumber: row.invoice_number ?? undefined,
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
    paymentMethod: row.payment_method ?? null,
    paymentReference: row.payment_reference ?? null,
    notes: notesByProj.get(row.id),
    log: logByProj.get(row.id),
    lineItems: itemsByProj.get(row.id),
  };
  return p;
}

function projectToRow(p: Project): any {
  return {
    id: p.id,
    customer: p.customer,
    contact_person: p.contactPerson ?? null,
    point_person: p.pointPerson,
    project_name: p.projectName ?? "(untitled)",
    detail_summary: p.detailSummary ?? null,
    supplier_id: p.supplierId ?? null,
    supplier_label: p.supplierLabel ?? null,
    shipping_mode: p.shippingMode ?? null,
    sales_shipping_label: p.salesShippingLabel ?? null,
    shipment_id: p.shipmentId ?? null,
    tracking_ref: p.trackingRef ?? null,
    pipeline_id: p.pipeline,
    stage_id: p.stage,
    deadline: p.deadline,
    deadline_date: p.deadlineDate.toISOString(),
    value: p.value,
    order_type: p.orderType,
    priority: p.priority,
    tag: p.tag ?? null,
    quote_number: p.quoteNumber ?? null,
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
    metadata: e.metadata ?? null,
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
  if (pipeline === "sales") return p.stages.filter((s) => s.id !== "archive").map((s) => s.id);
  if (pipeline === "shipping") return ["shipment_assigned"];
  return p.stages.map((s) => s.id);
}

export function getNextStage(pipeline: PipelineId, stage: StageId): { pipeline: PipelineId; stage: StageId } | null {
  if (pipeline === "shipping") {
    if (stage === "shipment_required") return { pipeline: "shipping", stage: "shipment_assigned" };
    if (stage === "shipment_assigned") return { pipeline: "finance", stage: "invoice_required" };
    return null;
  }
  const stages = forwardStages(pipeline);
  const idx = stages.indexOf(stage);
  if (idx >= 0 && idx < stages.length - 1) {
    return { pipeline, stage: stages[idx + 1] };
  }
  const pi = PIPELINES.findIndex((x) => x.id === pipeline);
  if (pi < PIPELINES.length - 1) {
    const next = PIPELINES[pi + 1];
    if (next.id === "shipping") return { pipeline: "shipping", stage: "shipment_required" };
    return { pipeline: next.id, stage: next.stages[0].id };
  }
  return null;
}

export function getPrevStage(pipeline: PipelineId, stage: StageId): { pipeline: PipelineId; stage: StageId } | null {
  if (pipeline === "shipping") {
    if (stage === "shipment_assigned" || stage === "shipment_required") {
      return { pipeline: "operations", stage: "in_production" };
    }
    return null;
  }
  const stages = forwardStages(pipeline);
  const idx = stages.indexOf(stage);
  if (idx > 0) return { pipeline, stage: stages[idx - 1] };
  const pi = PIPELINES.findIndex((x) => x.id === pipeline);
  if (pi > 0) {
    const prev = PIPELINES[pi - 1];
    if (prev.id === "shipping") return { pipeline: "shipping", stage: "shipment_assigned" };
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

export function validateMove(project: Project, target: { pipeline: PipelineId; stage: StageId }): MoveValidation {
  const STAGE_GATE_ORDER: StageId[] = [
    "proposal", "quote", "confirming",
    "design", "proof",
    "preproduction", "in_production",
    "shipment_required", "shipment_assigned",
    "invoice_required", "invoiced", "paid",
  ];
  const targetIdx = STAGE_GATE_ORDER.indexOf(target.stage);
  const gateIdx = STAGE_GATE_ORDER.indexOf("proof");
  if (target.stage === "archive") return { ok: true, missing: [] };
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
  moveCard: (cardId: string, target: { pipeline: PipelineId; stage: StageId }) => MoveResult;
  updateProject: (id: string, patch: Partial<Project>) => void;
  renameProject: (currentName: string, newName: string) => { count: number };
  addNote: (projectId: string, text: string, author?: string) => void;
  addLineItem: (projectId: string, item: LineItem) => void;
  updateLineItem: (projectId: string, index: number, item: LineItem) => void;
  removeLineItem: (projectId: string, index: number) => void;
  duplicateProject: (projectId: string) => Project | null;
  createProject: (input: { customer: string; projectName: string; detailSummary?: string; pointPerson?: string }) => Project;
  toggleFlag: (projectId: string) => void;
  softDeleteProject: (projectId: string) => { restoredFrom: { pipeline: PipelineId; stage: StageId } } | null;
  restoreProject: (projectId: string) => { pipeline: PipelineId; stage: StageId } | null;
  hardDeleteProject: (projectId: string) => void;
  deleteProject: (projectId: string) => void;
  addSupplier: (input: { name: string; country: string; defaultShippingMode: ShippingMode }) => Supplier;
  isQuoteNumberDuplicate: (number: string, exceptProjectId: string) => boolean;
  isPONumberDuplicate: (number: string, exceptProjectId: string) => boolean;
  isInvoiceNumberDuplicate: (number: string, exceptProjectId: string) => boolean;
  assignToShipment: (projectId: string, shipmentId: string) => void;
  createShipment: (input: NewShipmentInput) => Shipment;
  updateShipment: (id: string, patch: Partial<Shipment>) => void;
  markShipmentDelivered: (shipmentId: string) => { count: number };
  pulsePipeline: PipelineId | null;
  triggerPulse: (id: PipelineId) => void;
}

const Ctx = createContext<PipelineStoreCtx | null>(null);

export const PipelineStoreProvider = ({ children }: { children: ReactNode }) => {
  // Phase 3a: useState is the single in-memory cache. It is hydrated from
  // Supabase on mount AND mutated optimistically by every store method.
  // Every mutation also writes to Supabase (fire-and-forget for now; errors
  // log to console). Phase 3b will wire async error handling and remove the
  // legacy SEED_PROJECTS hydration fallback.
  const [projects, setProjects] = useState<Project[]>(() =>
    // Fallback hydration from in-memory seed so the UI has something to
    // show before the Supabase fetch returns. Replaced as soon as the
    // initial fetch resolves.
    SEED_PROJECTS.map((p, i) => {
      const s = p.stage as string;
      let next: Project = { ...p };
      if (p.pipeline === "shipping" &&
          s !== "shipment_required" && s !== "shipment_assigned") {
        next = { ...next, pipeline: "finance" as const, stage: "invoice_required" as const };
      }
      if (!next.paymentTerms) {
        next.paymentTerms = "Net 30";
        next.paymentTermsInherited = true;
      }
      if (next.pipeline === "finance") {
        const now = Date.now();
        if (next.stage === "invoice_required" && !next.invoiceRequiredEnteredAt) {
          const off = ((i * 13 + 5) % 22) + 1;
          next.invoiceRequiredEnteredAt = new Date(now - off * 86400000);
        }
        if ((next.stage === "invoiced" || next.stage === "paid") && !next.invoiceIssuedDate) {
          const base = next.stage === "paid" ? 30 : 12;
          const jitter = ((i * 7 + 3) % 18) - 4;
          const days = Math.max(1, base + jitter);
          next.invoiceIssuedDate = new Date(now - days * 86400000);
          next.invoiceIssuedDateAssumed = true;
        }
      }
      if (!next.log || next.log.length === 0) {
        next = appendLog(next, {
          ts: next.createdAt,
          actor: actorOf(SYSTEM_CURRENT_USER),
          actionType: "project_created",
          description: `${SYSTEM_CURRENT_USER.shortName} created this project`,
        }).project;
      }
      return next;
    }),
  );
  const [shipments, setShipments] = useState<Shipment[]>(() => SEED_SHIPMENTS.map((s) => ({ ...s })));
  const [suppliers, setSuppliers] = useState<Supplier[]>(() => SUPPLIERS.map((s) => ({ ...s })));
  const [loading, setLoading] = useState(true);
  const currentUser = useCurrentUser();
  const userRef = useRef(currentUser); userRef.current = currentUser;
  const suppliersRef = useRef(suppliers); suppliersRef.current = suppliers;
  const [pulsePipeline, setPulsePipeline] = useState<PipelineId | null>(null);
  const pulseTimer = useRef<number | null>(null);

  // ── Initial fetch from Supabase + realtime subscription ───────────────
  // SCALING NOTE: chatty fan-out, fine to ~5k projects, revisit when
  // growth requires pagination or scoped subscriptions.
  useEffect(() => {
    let mounted = true;
    const refetch = async () => {
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
          metadata: r.metadata ?? undefined,
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
    refetch();

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
      supabase.removeChannel(channel);
    };
  }, []);

  const triggerPulse = useCallback((id: PipelineId) => {
    setPulsePipeline(id);
    if (pulseTimer.current) window.clearTimeout(pulseTimer.current);
    pulseTimer.current = window.setTimeout(() => setPulsePipeline(null), 900);
  }, []);

  const touch = (p: Project): Project => ({ ...p, updatedAt: new Date() });

  // Fire-and-forget Supabase write helpers (Phase 3a). Errors logged.
  const persistProject = (p: Project) => {
    supabase.from("projects").upsert(projectToRow(p)).then(({ error }) => {
      if (error) console.error("[store] persistProject", p.id, error.message);
    });
  };
  const persistLog = (projectId: string, entries: ProjectLogEntry[]) => {
    if (!entries.length) return;
    supabase.from("project_log_entries").insert(entries.map((e) => logEntryToRow(projectId, e)))
      .then(({ error }) => { if (error) console.error("[store] persistLog", projectId, error.message); });
  };
  const persistNote = (projectId: string, n: ProjectNote) => {
    supabase.from("project_notes").insert(noteToRow(projectId, n))
      .then(({ error }) => { if (error) console.error("[store] persistNote", projectId, error.message); });
  };
  const persistLineItems = (projectId: string, items: LineItem[]) => {
    // Replace strategy: delete + reinsert with positions.
    supabase.from("line_items").delete().eq("project_id", projectId).then(() => {
      if (!items.length) return;
      const rows = items.map((li, i) => ({
        project_id: projectId, position: i, qty: li.qty, description: li.description,
        unit_price: li.unitPrice ?? null, total: li.total ?? null, product_id: li.productId ?? null,
      }));
      supabase.from("line_items").insert(rows).then(({ error }) => {
        if (error) console.error("[store] persistLineItems", projectId, error.message);
      });
    });
  };

  const moveCard = useCallback<PipelineStoreCtx["moveCard"]>((cardId, target) => {
    const proj = projects.find((p) => p.id === cardId);
    if (!proj) return { ok: false };

    const v = validateMove(proj, target);
    if (!v.ok) return { blocked: { reason: "missing-fields", missing: v.missing } };

    let newEntries: ProjectLogEntry[] = [];
    let updated: Project | null = null;
    setProjects((prev) => prev.map((p) => {
      if (p.id !== cardId) return p;
      const patch: Partial<Project> = { pipeline: target.pipeline, stage: target.stage };
      if (target.pipeline === "shipping" && target.stage === "shipment_required") {
        patch.shipmentId = undefined;
      }
      if (target.stage === "quote" && !p.quoteNumber) {
        patch.quoteNumber = `Q-${2040 + Math.floor(Math.random() * 41)}`;
      }
      if (target.pipeline === "operations" && !p.poNumber) {
        patch.poNumber = `PO-${1080 + Math.floor(Math.random() * 31)}`;
      }
      if (target.pipeline === "finance" && !p.invoiceNumber) {
        patch.invoiceNumber = `INV-${1040 + Math.floor(Math.random() * 21)}`;
      }
      if (target.pipeline === "finance" && target.stage === "invoice_required"
          && !p.invoiceRequiredEnteredAt) {
        patch.invoiceRequiredEnteredAt = new Date();
      }
      if (target.pipeline === "finance" && target.stage === "invoiced"
          && !p.invoiceIssuedDate) {
        patch.invoiceIssuedDate = new Date();
        patch.invoiceIssuedDateAssumed = true;
      }
      const u = userRef.current;
      const fromLabel = pipelineStageLabel(p.pipeline, p.stage);
      const toLabel = pipelineStageLabel(target.pipeline, target.stage);
      const isPaid = target.pipeline === "finance" && target.stage === "paid";
      const isArchive = target.pipeline === "sales" && target.stage === "archive";
      const wasArchive = p.pipeline === "sales" && p.stage === "archive";
      let next = touch({ ...p, ...patch });
      let res;
      if (isPaid) {
        res = appendLog(next, {
          actor: actorOf(u), actionType: "mark_paid",
          description: `${u.shortName} marked this paid`,
          metadata: { fromPipeline: p.pipeline, fromStage: p.stage, toPipeline: target.pipeline, toStage: target.stage },
        });
      } else if (isArchive) {
        res = appendLog(next, {
          actor: actorOf(u), actionType: "archive",
          description: `${u.shortName} archived this`,
          metadata: { fromPipeline: p.pipeline, fromStage: p.stage },
        });
      } else if (wasArchive) {
        res = appendLog(next, {
          actor: actorOf(u), actionType: "unarchive",
          description: `${u.shortName} restored this from archive`,
          metadata: { toPipeline: target.pipeline, toStage: target.stage },
        });
      } else {
        res = appendLog(next, {
          actor: actorOf(u), actionType: "stage_change",
          description: `${u.shortName} moved this from ${fromLabel} to ${toLabel}`,
          metadata: { fromPipeline: p.pipeline, fromStage: p.stage, toPipeline: target.pipeline, toStage: target.stage },
        });
      }
      newEntries.push(res.entry);
      updated = res.project;
      return res.project;
    }));
    if (updated) {
      persistProject(updated);
      persistLog(updated.id, newEntries);
    }
    return { ok: true };
  }, [projects]);

  const updateProject = useCallback((id: string, patch: Partial<Project>) => {
    let updated: Project | null = null;
    let newEntries: ProjectLogEntry[] = [];
    setProjects((prev) => prev.map((p) => {
      if (p.id !== id) return p;
      const u = userRef.current;
      const entries = buildFieldEditEntries(p, patch, u, suppliersRef.current);
      let next = touch({ ...p, ...patch });
      for (const e of entries) {
        const res = appendLog(next, e);
        next = res.project;
        newEntries.push(res.entry);
      }
      updated = next;
      return next;
    }));
    if (updated) {
      persistProject(updated);
      persistLog(id, newEntries);
    }
  }, []);

  const renameProject = useCallback((currentName: string, newName: string) => {
    let count = 0;
    const u = userRef.current;
    const writes: Project[] = [];
    const logWrites: Array<{ id: string; entry: ProjectLogEntry }> = [];
    setProjects((prev) => prev.map((p) => {
      if (p.projectName === currentName) {
        count += 1;
        const res = appendLog(touch({ ...p, projectName: newName }), {
          actor: actorOf(u), actionType: "field_edit",
          description: `${u.shortName} changed project name from ${currentName} to ${newName}`,
          metadata: { field: "projectName", fromValue: currentName, toValue: newName },
        });
        writes.push(res.project);
        logWrites.push({ id: res.project.id, entry: res.entry });
        return res.project;
      }
      return p;
    }));
    for (const w of writes) persistProject(w);
    for (const lw of logWrites) persistLog(lw.id, [lw.entry]);
    return { count };
  }, []);

  const addNote = useCallback((projectId: string, text: string, _author?: string) => {
    const u = userRef.current;
    const note: ProjectNote = {
      id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      ts: new Date(), author: u.fullName, authorUserId: u.userId, text,
    };
    let updated: Project | null = null;
    let entry: ProjectLogEntry | null = null;
    setProjects((prev) => prev.map((p) => {
      if (p.id !== projectId) return p;
      let next = touch({ ...p, notes: [...(p.notes ?? []), note] });
      const res = appendLog(next, {
        actor: actorOf(u), actionType: "note_added",
        description: `${u.shortName} added a note`,
      });
      updated = res.project;
      entry = res.entry;
      return res.project;
    }));
    if (updated) {
      persistProject(updated);
      persistNote(projectId, note);
      if (entry) persistLog(projectId, [entry]);
    }
  }, []);

  const addLineItem = useCallback((projectId: string, item: LineItem) => {
    let updated: Project | null = null;
    let entry: ProjectLogEntry | null = null;
    setProjects((prev) => prev.map((p) => {
      if (p.id !== projectId) return p;
      const u = userRef.current;
      let next = touch({ ...p, lineItems: [...(p.lineItems ?? []), item] });
      const res = appendLog(next, {
        actor: actorOf(u), actionType: "line_item_change",
        description: `${u.shortName} added line item ${item.qty} × ${item.description}`,
      });
      updated = res.project;
      entry = res.entry;
      return res.project;
    }));
    if (updated) {
      persistProject(updated);
      persistLineItems(projectId, updated.lineItems ?? []);
      if (entry) persistLog(projectId, [entry]);
    }
  }, []);

  const updateLineItem = useCallback((projectId: string, index: number, item: LineItem) => {
    let updated: Project | null = null;
    let entry: ProjectLogEntry | null = null;
    setProjects((prev) => prev.map((p) => {
      if (p.id !== projectId) return p;
      const items = [...(p.lineItems ?? [])];
      if (index < 0 || index >= items.length) return p;
      items[index] = item;
      const u = userRef.current;
      let next = touch({ ...p, lineItems: items });
      const res = appendLog(next, {
        actor: actorOf(u), actionType: "line_item_change",
        description: `${u.shortName} edited line item ${item.qty} × ${item.description}`,
      });
      updated = res.project;
      entry = res.entry;
      return res.project;
    }));
    if (updated) {
      persistProject(updated);
      persistLineItems(projectId, updated.lineItems ?? []);
      if (entry) persistLog(projectId, [entry]);
    }
  }, []);

  const removeLineItem = useCallback((projectId: string, index: number) => {
    let updated: Project | null = null;
    let entry: ProjectLogEntry | null = null;
    setProjects((prev) => prev.map((p) => {
      if (p.id !== projectId) return p;
      const items = [...(p.lineItems ?? [])];
      if (index < 0 || index >= items.length) return p;
      const removed = items[index];
      items.splice(index, 1);
      const u = userRef.current;
      let next = touch({ ...p, lineItems: items });
      const res = appendLog(next, {
        actor: actorOf(u), actionType: "line_item_change",
        description: `${u.shortName} removed line item ${removed.qty} × ${removed.description}`,
      });
      updated = res.project;
      entry = res.entry;
      return res.project;
    }));
    if (updated) {
      persistProject(updated);
      persistLineItems(projectId, updated.lineItems ?? []);
      if (entry) persistLog(projectId, [entry]);
    }
  }, []);

  const duplicateProject = useCallback((projectId: string): Project | null => {
    const orig = projects.find((p) => p.id === projectId);
    if (!orig) return null;
    const u = userRef.current;
    let copy: Project = {
      ...orig,
      id: `prj-dup-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      projectName: `${orig.projectName} (Copy)`,
      quoteNumber: undefined,
      poNumber: undefined,
      invoiceNumber: undefined,
      shipmentId: undefined,
      notes: undefined,
      lineItems: undefined,
      log: undefined,
      pipeline: orig.pipeline,
      stage: orig.stage,
      flagged: false,
      deletedAt: undefined,
      deletedFromPipeline: undefined,
      deletedFromStage: undefined,
      createdAt: new Date(),
      updatedAt: undefined,
    };
    const res = appendLog(copy, {
      actor: actorOf(u), actionType: "project_created",
      description: `${u.shortName} duplicated this from ${orig.projectName}`,
    });
    copy = res.project;
    setProjects((prev) => [copy, ...prev]);
    persistProject(copy);
    persistLog(copy.id, [res.entry]);
    return copy;
  }, [projects]);

  const createProject = useCallback<PipelineStoreCtx["createProject"]>((input) => {
    const u = userRef.current;
    let newProj: Project = {
      id: `prj-new-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      customer: input.customer,
      projectName: input.projectName,
      detailSummary: input.detailSummary,
      pointPerson: input.pointPerson ?? "AV",
      pipeline: "sales",
      stage: "proposal",
      deadline: "—",
      deadlineDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      value: 0,
      orderType: "New",
      priority: "Standard",
      createdAt: new Date(),
      paymentTerms: "Net 30",
      paymentTermsInherited: true,
    };
    const res = appendLog(newProj, {
      actor: actorOf(u), actionType: "project_created",
      description: `${u.shortName} created this project`,
    });
    newProj = res.project;
    setProjects((prev) => [newProj, ...prev]);
    persistProject(newProj);
    persistLog(newProj.id, [res.entry]);
    return newProj;
  }, []);

  const toggleFlag = useCallback<PipelineStoreCtx["toggleFlag"]>((projectId) => {
    let updated: Project | null = null;
    let entry: ProjectLogEntry | null = null;
    setProjects((prev) => prev.map((p) => {
      if (p.id !== projectId) return p;
      const u = userRef.current;
      const next = touch({ ...p, flagged: !p.flagged });
      const res = appendLog(next, {
        actor: actorOf(u), actionType: "flag_toggle",
        description: !p.flagged ? `${u.shortName} flagged this` : `${u.shortName} unflagged this`,
      });
      updated = res.project;
      entry = res.entry;
      return res.project;
    }));
    if (updated) {
      persistProject(updated);
      if (entry) persistLog(projectId, [entry]);
    }
  }, []);

  const TRASH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

  const softDeleteProject = useCallback<PipelineStoreCtx["softDeleteProject"]>((projectId) => {
    const orig = projects.find((p) => p.id === projectId && !p.deletedAt);
    if (!orig) return null;
    const restoredFrom = { pipeline: orig.pipeline, stage: orig.stage };
    const u = userRef.current;
    let updated: Project | null = null;
    let entry: ProjectLogEntry | null = null;
    setProjects((prev) => prev.map((p) => {
      if (p.id !== projectId) return p;
      const res = appendLog(
        { ...p, deletedAt: new Date(), deletedFromPipeline: orig.pipeline, deletedFromStage: orig.stage },
        { actor: actorOf(u), actionType: "trash", description: `${u.shortName} moved this to Trash` },
      );
      updated = res.project;
      entry = res.entry;
      return res.project;
    }));
    if (updated) {
      persistProject(updated);
      if (entry) persistLog(projectId, [entry]);
    }
    return { restoredFrom };
  }, [projects]);

  const restoreProject = useCallback<PipelineStoreCtx["restoreProject"]>((projectId) => {
    const orig = projects.find((p) => p.id === projectId && p.deletedAt);
    if (!orig) return null;
    const knownStages: StageId[] = PIPELINES.flatMap((pp) => pp.stages.map((s) => s.id));
    const targetPipeline: PipelineId = orig.deletedFromPipeline ?? orig.pipeline ?? "sales";
    const fallbackStage: Record<PipelineId, StageId> = {
      sales: "quote", design: "design", operations: "preproduction",
      shipping: "shipment_required", finance: "invoice_required",
    };
    const targetStage: StageId =
      orig.deletedFromStage && knownStages.includes(orig.deletedFromStage)
        ? orig.deletedFromStage
        : fallbackStage[targetPipeline];
    const u = userRef.current;
    let updated: Project | null = null;
    let entry: ProjectLogEntry | null = null;
    setProjects((prev) => prev.map((p) => {
      if (p.id !== projectId) return p;
      const res = appendLog(
        { ...p, pipeline: targetPipeline, stage: targetStage,
          deletedAt: undefined, deletedFromPipeline: undefined, deletedFromStage: undefined },
        { actor: actorOf(u), actionType: "restore", description: `${u.shortName} restored this from Trash` },
      );
      updated = res.project;
      entry = res.entry;
      return res.project;
    }));
    if (updated) {
      persistProject(updated);
      if (entry) persistLog(projectId, [entry]);
    }
    return { pipeline: targetPipeline, stage: targetStage };
  }, [projects]);

  const hardDeleteProject = useCallback((projectId: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
    supabase.from("projects").delete().eq("id", projectId).then(({ error }) => {
      if (error) console.error("[store] hardDelete", projectId, error.message);
    });
  }, []);

  const deleteProject = useCallback((projectId: string) => {
    softDeleteProject(projectId);
  }, [softDeleteProject]);

  const addSupplier = useCallback((input: { name: string; country: string; defaultShippingMode: ShippingMode }): Supplier => {
    const sup: Supplier = {
      id: `sup-${Date.now()}`,
      name: input.name,
      country: input.country,
      defaultShippingMode: input.defaultShippingMode,
      contact: "—",
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

  const assignToShipment = useCallback((projectId: string, shipmentId: string) => {
    const ship = shipments.find((s) => s.id === shipmentId);
    if (!ship) return;
    const u = userRef.current;
    let updated: Project | null = null;
    let entry: ProjectLogEntry | null = null;
    setProjects((prev) => prev.map((p) => {
      if (p.id !== projectId) return p;
      const next = touch({ ...p, shipmentId, pipeline: "shipping" as const, stage: "shipment_assigned" as const, shippingMode: ship.mode });
      const res = appendLog(next, {
        actor: actorOf(u), actionType: "stage_change",
        description: `${u.shortName} assigned this to shipment ${ship.code}`,
        metadata: { fromPipeline: p.pipeline, fromStage: p.stage, toPipeline: "shipping", toStage: "shipment_assigned" },
      });
      updated = res.project;
      entry = res.entry;
      return res.project;
    }));
    if (updated) {
      persistProject(updated);
      if (entry) persistLog(projectId, [entry]);
    }
  }, [shipments]);

  const createShipment = useCallback((input: NewShipmentInput): Shipment => {
    const newShip: Shipment = {
      id: `ship-${Date.now()}`,
      code: input.code,
      mode: input.mode,
      carrier: input.mode === "Air" ? (input.carrier ?? "DHL") : undefined,
      supplierId: input.supplierId,
      etd: input.etd,
      eta: input.eta,
      status: "Booked",
    };
    setShipments((prev) => [...prev, newShip]);
    supabase.from("shipments").insert(shipmentToRow(newShip)).then(({ error }) => {
      if (error) console.error("[store] createShipment", newShip.id, error.message);
    });
    return newShip;
  }, []);

  const updateShipment = useCallback((id: string, patch: Partial<Shipment>) => {
    let merged: Shipment | null = null;
    setShipments((prev) => prev.map((s) => {
      if (s.id !== id) return s;
      merged = { ...s, ...patch };
      return merged;
    }));
    setProjects((prev) => prev.map((p) => (p.shipmentId === id ? touch(p) : p)));
    if (merged) {
      supabase.from("shipments").update(shipmentToRow(merged)).eq("id", id).then(({ error }) => {
        if (error) console.error("[store] updateShipment", id, error.message);
      });
    }
  }, []);

  const markShipmentDelivered = useCallback((shipmentId: string) => {
    let count = 0;
    const u = userRef.current;
    const writes: Project[] = [];
    const logWrites: Array<{ id: string; entry: ProjectLogEntry }> = [];
    setProjects((prev) => prev.map((p) => {
      if (p.shipmentId === shipmentId && p.pipeline === "shipping") {
        count += 1;
        const patch: Partial<Project> = { pipeline: "finance", stage: "invoice_required" };
        if (!p.invoiceNumber) patch.invoiceNumber = `INV-${1500 + Math.floor(Math.random() * 800)}`;
        const next = touch({ ...p, ...patch });
        const res = appendLog(next, {
          actor: actorOf(u), actionType: "stage_change",
          description: `${u.shortName} marked shipment delivered`,
          metadata: { fromPipeline: p.pipeline, fromStage: p.stage, toPipeline: "finance", toStage: "invoice_required" },
        });
        writes.push(res.project);
        logWrites.push({ id: res.project.id, entry: res.entry });
        return res.project;
      }
      return p;
    }));
    setShipments((prev) => prev.map((s) => s.id === shipmentId ? { ...s, status: "Delivered" } : s));
    for (const w of writes) persistProject(w);
    for (const lw of logWrites) persistLog(lw.id, [lw.entry]);
    supabase.from("shipments").update({ status: "Delivered" }).eq("id", shipmentId);
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
    moveCard, updateProject, renameProject, addNote,
    addLineItem, updateLineItem, removeLineItem,
    duplicateProject, createProject, toggleFlag,
    softDeleteProject, restoreProject, hardDeleteProject, deleteProject,
    addSupplier,
    isQuoteNumberDuplicate, isPONumberDuplicate, isInvoiceNumberDuplicate,
    assignToShipment, createShipment, updateShipment, markShipmentDelivered,
    pulsePipeline, triggerPulse,
  }), [liveProjects, trashedProjects, archivedProjects, shipments, suppliers, loading, moveCard, updateProject, renameProject, addNote, addLineItem, updateLineItem, removeLineItem, duplicateProject, createProject, toggleFlag, softDeleteProject, restoreProject, hardDeleteProject, deleteProject, addSupplier, isQuoteNumberDuplicate, isPONumberDuplicate, isInvoiceNumberDuplicate, assignToShipment, createShipment, updateShipment, markShipmentDelivered, pulsePipeline, triggerPulse]);


  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const usePipelineStore = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePipelineStore must be used inside PipelineStoreProvider");
  return ctx;
};
