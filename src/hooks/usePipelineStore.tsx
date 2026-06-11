import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from "react";
import { toast } from "sonner";
import {
  PIPELINES, PipelineId, StageId, Project, Shipment, Supplier, ProjectNote, LineItem,
  ProjectLogEntry, ProjectLogActionType,
  SUPPLIERS, ShippingMode, PaymentMethod, WeightUnit, VolumeUnit, Currency,
} from "@/data/pipelines";
import { useCurrentUser, type CurrentUser } from "./useCurrentUser";
import { supabase } from "@/integrations/supabase/client";
import { pushUndo, isUndoing, getUndoContext, makeUndoId, clearUndoStack, type UndoEntry } from "./useUndoStack";

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
  // If a Cmd+Z undo is currently being applied, tag the auto-generated audit
  // entry so the original action remains discoverable from the inverse entry.
  const ctx = getUndoContext();
  const metadata = ctx
    ? { ...(entry.metadata ?? {}), undoOfLogId: ctx.originalLogId, undoOfDescription: ctx.originalDescription }
    : entry.metadata;
  const description = ctx
    ? `${entry.description} (undo)`
    : entry.description;
  const full: ProjectLogEntry = {
    id: makeLogId(),
    ts: entry.ts ?? new Date(),
    actor: entry.actor,
    actionType: entry.actionType,
    description,
    metadata,
  };
  // NOTE: `log` is no longer carried on the Project type. The audit trail
  // lives in project_log_entries and is fetched per-project via useProjectLog.
  // The returned `project` is byte-identical to the input; the `entry` is
  // shipped to the DB by callers via logEntryToRow().
  return { project: p, entry: full };
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
  poAmount: "PO amount",
  poAmountCurrency: "PO currency",
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
  "updatedAt", "createdAt", "notes", "lineItems",
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
function rowToProject(row: any, notesByProj: Map<string, ProjectNote[]>, itemsByProj: Map<string, LineItem[]>): Project {
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
    stageEnteredAt: row.stage_entered_at ? new Date(row.stage_entered_at) : undefined,
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
    poAmount: row.po_amount != null ? Number(row.po_amount) : null,
    poAmountCurrency: (row.po_amount_currency ?? "USD") as Currency,
    weightUnit: (row.weight_unit ?? "kg") as WeightUnit,
    volumeValue: row.volume_value != null ? Number(row.volume_value) : (row.cbm != null ? Number(row.cbm) : null),
    volumeUnit: (row.volume_unit ?? "CBM") as VolumeUnit,
    depositRequired: !!row.deposit_required,
    depositInvoiceNumber: row.deposit_invoice_number ?? null,
    depositAmount: row.deposit_amount != null ? Number(row.deposit_amount) : null,
    depositPaidDate: row.deposit_paid_date ? new Date(row.deposit_paid_date) : null,
    depositPaidMethod: (row.deposit_paid_method ?? null) as PaymentMethod | null,
    depositPaymentReference: row.deposit_payment_reference ?? null,
    // Phase 2b additions
    customerPoNumber: row.customer_po_number ?? null,
    emailVerbalApproved: !!row.email_verbal_approved,
    emailVerbalApprovedAt: row.email_verbal_approved_at ?? null,
    emailVerbalApprovedByBuyerId: row.email_verbal_approved_by_buyer_id ?? null,
    emailVerbalApprovedViaChannel: row.email_verbal_approved_via_channel ?? null,
    emailVerbalApprovedOtherName: row.email_verbal_approved_other_name ?? null,
    emailVerbalApprovedNotes: row.email_verbal_approved_notes ?? null,
    emailVerbalApprovedRecordedByUserId: row.email_verbal_approved_recorded_by_user_id ?? null,
    orderConfirmationOverrides: (row.order_confirmation_overrides ?? {}) as any,
    notes: notesByProj.get(row.id),
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
    weight_unit: p.weightUnit ?? "kg",
    volume_value: p.volumeValue ?? null,
    volume_unit: p.volumeUnit ?? "CBM",
    // Legacy mirror: keep `cbm` populated when volume is in CBM, NULL otherwise.
    cbm: (p.volumeUnit ?? "CBM") === "CBM" && p.volumeValue != null ? Number(p.volumeValue) : null,
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
    po_amount: p.poAmount ?? null,
    po_amount_currency: p.poAmountCurrency ?? "USD",
    deposit_required: !!p.depositRequired,
    deposit_invoice_number: p.depositInvoiceNumber ?? null,
    deposit_amount: p.depositAmount ?? null,
    deposit_paid_date: p.depositPaidDate ? p.depositPaidDate.toISOString() : null,
    deposit_paid_method: p.depositPaidMethod ?? null,
    deposit_payment_reference: p.depositPaymentReference ?? null,
    customer_po_number: p.customerPoNumber ?? null,
    email_verbal_approved: !!p.emailVerbalApproved,
    email_verbal_approved_at: p.emailVerbalApprovedAt ?? null,
    email_verbal_approved_by_buyer_id: p.emailVerbalApprovedByBuyerId ?? null,
    email_verbal_approved_via_channel: p.emailVerbalApprovedViaChannel ?? null,
    email_verbal_approved_other_name: p.emailVerbalApprovedOtherName ?? null,
    email_verbal_approved_notes: p.emailVerbalApprovedNotes ?? null,
    email_verbal_approved_recorded_by_user_id: p.emailVerbalApprovedRecordedByUserId ?? null,
    order_confirmation_overrides: p.orderConfirmationOverrides ?? {},
    stage_entered_at: p.stageEnteredAt ? p.stageEnteredAt.toISOString() : null,
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
  /**
   * Find live projects (not soft-deleted, not the current one) sharing the same
   * value in a document-number field. Returns [] for empty/undefined values.
   * Used to surface the "also used on" soft notice in the project detail editor.
   */
  findProjectsByDocField: (
    field: "quoteNumber" | "poNumber" | "invoiceNumber" | "proofNumber" | "depositInvoiceNumber",
    value: string | null | undefined,
    exceptProjectId: string,
  ) => Project[];
  assignToShipment: (projectId: string, shipmentId: string) => Promise<void>;
  createShipment: (input: NewShipmentInput) => Promise<Shipment | null>;
  updateShipment: (id: string, patch: Partial<Shipment>) => Promise<void>;
  markShipmentDelivered: (shipmentId: string) => Promise<{ count: number }>;
  pulsePipeline: PipelineId | null;
  triggerPulse: (id: PipelineId) => void;
}

const Ctx = createContext<PipelineStoreCtx | null>(null);

const FAILURE_TOAST = "Couldn't save change — please try again";

// Map known Postgres CHECK constraint names to friendly user-facing messages.
// Extend this when new constraints are added.
const CHECK_CONSTRAINT_MESSAGES: Record<string, string> = {
  projects_deposit_amount_chk: "Deposit amount can't exceed the project value",
  projects_deposit_paid_method_chk: "Invalid payment method",
};

/**
 * Turn a Postgres error from a Supabase mutation into a user-friendly toast
 * message. We always preserve the raw message in the fallback so we never
 * regress to the opaque "please try again" string.
 */
export const friendlyPgErrorMessage = (err: { code?: string; message?: string } | null | undefined): string => {
  if (!err) return FAILURE_TOAST;
  const code = err.code ?? "";
  const message = err.message ?? "";
  if (code === "23514") {
    const name = message.match(/constraint "([^"]+)"/)?.[1];
    if (name && CHECK_CONSTRAINT_MESSAGES[name]) return CHECK_CONSTRAINT_MESSAGES[name];
    return `Validation failed: ${message}`;
  }
  if (code === "23502") {
    const col = message.match(/null value in column "([^"]+)"/)?.[1]
      ?? message.match(/column "([^"]+)"/)?.[1];
    return col ? `Missing required field: ${col}` : "Missing required field";
  }
  if (code === "23503") return "Referenced record doesn't exist";
  if (code === "42501") return "You don't have permission to make this change";
  return message ? `Couldn't save: ${message}` : FAILURE_TOAST;
};

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

  // Stable reference holder for in-store mutation fns so undo inverse
  // closures don't need to be re-bound or hoisted past their definitions.
  const apiRef = useRef<{
    updateProject?: (id: string, patch: Partial<Project>) => Promise<void>;
    moveCard?: (id: string, target: { pipeline: PipelineId; stage: StageId }) => Promise<MoveResult>;
    toggleFlag?: (id: string) => Promise<void>;
    restoreNote?: (projectId: string, note: ProjectNote) => Promise<void>;
    removeNote?: (projectId: string, noteId: string) => Promise<void>;
    updateNote?: (projectId: string, noteId: string, text: string) => Promise<void>;
    addLineItem?: (projectId: string, item: LineItem) => Promise<void>;
    removeLineItem?: (projectId: string, index: number) => Promise<void>;
    updateLineItem?: (projectId: string, index: number, item: LineItem) => Promise<void>;
    commitRaw?: (project: Project, entries: ProjectLogEntry[]) => Promise<boolean>;
  }>({});

  // Clear undo stack when the authenticated user changes (sign-in/sign-out).
  useEffect(() => {
    clearUndoStack();
  }, [currentUser.userId]);


  // ── Initial fetch from Supabase + realtime subscription ───────────────
  // SCALING NOTE: chatty fan-out, fine to ~5k projects, revisit when
  // growth requires pagination or scoped subscriptions.
  // FLICKER NOTE: realtime debounced; rows are keyed by id so React
  // reconciles in-place — no card disappearance during refetch.
  useEffect(() => {
    let mounted = true;
    let refetchTimer: number | null = null;

    const refetchNow = async () => {
      const [pj, sh, nt, li] = await Promise.all([
        // Exclude the `__system__` sentinel row that exists only as a FK
        // anchor for system-level audit entries (sign-in / sign-out). It
        // must never reach pipeline / spreadsheet / trash / archive views.
        supabase.from("projects").select("*").neq("id", "__system__"),
        supabase.from("shipments").select("*"),
        supabase.from("project_notes").select("*").order("ts"),
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
        setProjects(pj.data.map((row) => rowToProject(row, notesByProj, itemsByProj)));
      }
      if (sh.data) setShipments(sh.data.map(rowToShipment));
      setLoading(false);
    };

    const refetch = () => {
      if (refetchTimer) window.clearTimeout(refetchTimer);
      refetchTimer = window.setTimeout(() => { refetchNow(); }, 150);
    };

    refetchNow();

    // NOTE: project_log_entries is intentionally NOT subscribed here.
    // The audit log is fetched per-project by useProjectLog, which owns
    // its own filtered postgres_changes subscription. Inserting log rows
    // must not trigger a refetch of every project / shipment / line item.
    const channel = supabase
      .channel("pipeline-store")
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, refetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "shipments" }, refetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "project_notes" }, refetch)
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

  // ── Quote-level field mirroring ──────────────────────────────────────
  // Some fields conceptually belong to the quote, not the individual entry.
  // When multiple project rows share a quote_number (sub-entries of one
  // quote), edits to these fields on any entry mirror to every sibling.
  // Supplier-level fields (po_number, po_amount, po_amount_currency,
  // supplier_id) are intentionally NOT mirrored — different sub-entries
  // can be sourced from different suppliers under one customer quote.
  //
  // When/if we introduce a true quotes parent table, these fields move to
  // quote.* and this mirroring logic gets deleted in favor of the FK join.
  type MirrorField = {
    projKey: keyof Project;
    dbCol: string;
    /** Serialize the camelCase Project value for the snake_case DB column. */
    toDb: (v: any) => any;
  };
  const MIRRORED_FIELDS: ReadonlyArray<MirrorField> = [
    { projKey: "depositRequired",            dbCol: "deposit_required",            toDb: (v) => !!v },
    { projKey: "depositInvoiceNumber",       dbCol: "deposit_invoice_number",      toDb: (v) => v ?? null },
    { projKey: "depositAmount",              dbCol: "deposit_amount",              toDb: (v) => v ?? null },
    { projKey: "depositPaidDate",            dbCol: "deposit_paid_date",           toDb: (v) => (v instanceof Date ? v.toISOString() : v ?? null) },
    { projKey: "depositPaidMethod",          dbCol: "deposit_paid_method",         toDb: (v) => v ?? null },
    { projKey: "depositPaymentReference",    dbCol: "deposit_payment_reference",   toDb: (v) => v ?? null },
    { projKey: "invoiceNumber",              dbCol: "invoice_number",              toDb: (v) => v ?? null },
    { projKey: "paidOnDate",                 dbCol: "paid_on_date",                toDb: (v) => (v instanceof Date ? v.toISOString() : v ?? null) },
    { projKey: "paymentMethod",              dbCol: "payment_method",              toDb: (v) => v ?? null },
    { projKey: "paymentReference",           dbCol: "payment_reference",           toDb: (v) => v ?? null },
    { projKey: "value",                      dbCol: "value",                       toDb: (v) => v },
    { projKey: "paymentTerms",               dbCol: "payment_terms",               toDb: (v) => v ?? null },
    { projKey: "paymentTermsCustomDays",     dbCol: "payment_terms_custom_days",   toDb: (v) => v ?? null },
    { projKey: "paymentTermsInherited",      dbCol: "payment_terms_inherited",     toDb: (v) => v ?? null },
    { projKey: "invoiceIssuedDate",          dbCol: "invoice_issued_date",         toDb: (v) => (v instanceof Date ? v.toISOString() : v ?? null) },
    { projKey: "invoiceIssuedDateAssumed",   dbCol: "invoice_issued_date_assumed", toDb: (v) => v ?? null },
    { projKey: "customerPoNumber",           dbCol: "customer_po_number",          toDb: (v) => v ?? null },
  ];

  /** Compare two values treating Dates by epoch and null/undefined as equal. */
  const sameValue = (a: any, b: any): boolean => {
    if (a == null && b == null) return true;
    if (a instanceof Date || b instanceof Date) {
      const aT = a instanceof Date ? a.getTime() : a == null ? null : new Date(a).getTime();
      const bT = b instanceof Date ? b.getTime() : b == null ? null : new Date(b).getTime();
      return aT === bT;
    }
    return a === b;
  };

  /**
   * After a successful primary save, mirror any changed quote-level fields
   * to sibling project rows sharing the same quote_number. Best-effort:
   * a mirror failure does NOT roll back the primary edit (a soft warning
   * toast is shown instead). Local state and DB are updated in lockstep.
   */
  const mirrorToSiblings = async (optimistic: Project, prevRow: Project | undefined) => {
    const qn = optimistic.quoteNumber;
    if (!qn) return;
    // Build the diff of mirrored fields.
    const changedProj: Partial<Project> = {};
    const changedDb: Record<string, any> = {};
    for (const f of MIRRORED_FIELDS) {
      const cur = (optimistic as any)[f.projKey];
      const prev = prevRow ? (prevRow as any)[f.projKey] : undefined;
      if (!sameValue(cur, prev)) {
        (changedProj as any)[f.projKey] = cur;
        changedDb[f.dbCol] = f.toDb(cur);
      }
    }
    if (Object.keys(changedDb).length === 0) return;

    const snapshot = projectsRef.current;
    const siblings = snapshot.filter(
      (p) => p.id !== optimistic.id && p.quoteNumber === qn && !p.deletedAt,
    );
    if (siblings.length === 0) return;

    // Optimistic local mirror.
    setProjects((prev) =>
      prev.map((p) =>
        p.id !== optimistic.id && p.quoteNumber === qn && !p.deletedAt
          ? ({ ...p, ...changedProj, updatedAt: new Date() } as Project)
          : p,
      ),
    );

    // quote_number in DB is stored as plain digits (no "Q-" prefix).
    const dbQn = qn.replace(/^Q-/, "");
    const { error } = await supabase
      .from("projects")
      .update({ ...changedDb, updated_at: new Date().toISOString() })
      .eq("quote_number", dbQn)
      .neq("id", optimistic.id)
      .is("deleted_at", null);

    if (error) {
      console.error("[store] mirror to siblings failed", qn, error.message);
      // Roll back the local sibling mirror so UI doesn't lie.
      setProjects(snapshot);
      toast.warning(`Saved this entry, but couldn't sync sibling entries on Q-${dbQn}`);
      return;
    }
    if (siblings.length > 0) {
      toast(`Synced ${siblings.length} sibling ${siblings.length === 1 ? "entry" : "entries"} on Q-${dbQn}`, { duration: 2000 });
    }
  };

  /**
   * Quote-join adoption — see src/lib/quoteAdoption.ts for pure payload
   * logic. Direction is strictly inbound: joining project ← source sibling.
   * Never writes to siblings. Returns the patch applied, or null if no
   * adoption happened.
   */
  const adoptQuoteFieldsOnJoin = async (
    optimistic: Project,
    prevRow: Project | undefined,
  ): Promise<Partial<Project> | null> => {
    const qn = optimistic.quoteNumber;
    if (!qn) return null;
    const prevQn = prevRow?.quoteNumber ?? null;
    if (prevQn === qn) return null;

    const snapshot = projectsRef.current;
    const siblings = snapshot.filter(
      (p) => p.id !== optimistic.id && p.quoteNumber === qn && !p.deletedAt,
    );
    if (siblings.length === 0) return null;

    const result = buildQuoteAdoptionPayload<Project>({
      optimistic,
      prevRow,
      siblings,
      mirroredFields: MIRRORED_FIELDS as ReadonlyArray<{ projKey: string }>,
      sameValue,
    });
    if (!result) return null;

    // DB column payload via MIRRORED_FIELDS serializers.
    const dbPatch: Record<string, any> = {};
    for (const f of MIRRORED_FIELDS) {
      if (f.projKey in result.patch) {
        dbPatch[f.dbCol] = f.toDb((result.patch as any)[f.projKey]);
      }
    }

    // Optimistic local update — joining project only.
    setProjects((prev) =>
      prev.map((p) =>
        p.id === optimistic.id ? ({ ...p, ...result.patch, updatedAt: new Date() } as Project) : p,
      ),
    );

    const { error } = await supabase
      .from("projects")
      .update({ ...dbPatch, updated_at: new Date().toISOString() })
      .eq("id", optimistic.id);

    if (error) {
      console.error("[store] adoptQuoteFieldsOnJoin failed", qn, error.message);
      setProjects((prev) => prev.map((p) => (p.id === optimistic.id ? optimistic : p)));
      toast.warning(`Joined Q-${qn} but couldn't inherit quote-level fields`);
      return null;
    }

    // Best-effort audit log on joining project.
    const u = userRef.current;
    const friendlyParts = result.changedKeys.map((k) => {
      const label = (FIELD_LABELS as any)[k] ?? k;
      const v = (result.patch as any)[k];
      const display =
        v == null
          ? "—"
          : v instanceof Date
            ? v.toISOString().slice(0, 10)
            : typeof v === "boolean"
              ? v ? "yes" : "no"
              : String(v);
      return `${label}: ${display}`;
    });
    const sourceName = (result.source as Project).projectName || result.source.id;
    const entry: ProjectLogEntry = {
      id: makeLogId(),
      ts: new Date(),
      actor: actorOf(u),
      actionType: "field_edit" as ProjectLogActionType,
      description: `${u.shortName} inherited quote-level fields from Q-${qn} (source: ${sourceName}): ${friendlyParts.join(", ")}`,
      metadata: {
        adoption: true,
        quoteNumber: qn,
        sourceProjectId: result.source.id,
        adoptedFields: result.changedKeys,
      } as any,
    };
    const { error: lErr } = await supabase
      .from("project_log_entries")
      .insert(logEntryToRow(optimistic.id, entry));
    if (lErr) console.warn("[store] adoption audit log insert failed", lErr.message);

    toast(
      `Inherited ${result.changedKeys.length} quote-level ${result.changedKeys.length === 1 ? "field" : "fields"} from Q-${qn}`,
      { duration: 2500 },
    );

    return result.patch;
  };

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
      toast.error(friendlyPgErrorMessage(pErr));
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
        toast.error(friendlyPgErrorMessage(lErr));
        return false;
      }
    }
    // Order matters — safety argument:
    //   1. mirrorToSiblings runs FIRST. It diffs optimistic vs prevRow on
    //      MIRRORED_FIELDS; only user-touched fields flow OUTWARD. Running
    //      this before adoption guarantees adopted-in values can never be
    //      mistaken for user edits and pushed back out to siblings.
    //   2. adoptQuoteFieldsOnJoin runs SECOND. When quoteNumber itself
    //      changed (a join), it copies every untouched MIRRORED field from
    //      one source sibling INTO this project only. Single-source by
    //      design so coupled units (payment_terms trio, invoice_issued_date
    //      pair, deposit cluster) stay internally consistent.
    //   3. reconcileCustomerPoApproval runs LAST, against the post-adoption
    //      project so an adopted PO# correctly reuses the sibling's
    //      existing approval row (update-in-place; never duplicates).
    await mirrorToSiblings(optimistic, prevRow);
    const adopted = await adoptQuoteFieldsOnJoin(optimistic, prevRow);
    const reconcileTarget: Project = adopted ? ({ ...optimistic, ...adopted } as Project) : optimistic;
    await reconcileCustomerPoApproval(reconcileTarget, prevRow);
    return true;
  };

  /**
   * Reconcile customer_po_approvals after a project save.
   * - PO set/changed (with quote): upsert one row per quote, preserving timestamp.
   * - PO cleared: delete the row for that quote.
   * - No quote_number: skip (defensive — UI blocks this path).
   */
  const reconcileCustomerPoApproval = async (optimistic: Project, prevRow: Project | undefined) => {
    const prevPo = prevRow?.customerPoNumber ?? null;
    const nextPo = optimistic.customerPoNumber ?? null;
    if (prevPo === nextPo) return;
    const qn = optimistic.quoteNumber ?? null;
    if (!qn) return;
    const u = userRef.current;

    if (!nextPo) {
      // Cleared → revoke approval for this quote.
      const { error } = await supabase
        .from("customer_po_approvals")
        .delete()
        .eq("quote_number", qn);
      if (error) console.warn("[store] auto-revoke customer_po_approval failed", error.message);
      return;
    }

    // Look up any existing approval row for this quote (one per quote).
    const { data: existing } = await supabase
      .from("customer_po_approvals")
      .select("*")
      .eq("quote_number", qn)
      .maybeSingle();

    if (existing) {
      if (existing.customer_po_number === nextPo) return; // no-op
      // PO# correction — preserve approved_on, approved_by, notes.
      const { error } = await supabase
        .from("customer_po_approvals")
        .update({ customer_po_number: nextPo })
        .eq("id", existing.id);
      if (error) console.warn("[store] auto-update customer_po_approval failed", error.message);
      return;
    }

    // Auto-create: data entry IS the approval.
    const { error } = await supabase.from("customer_po_approvals").insert({
      quote_number: qn,
      customer_po_number: nextPo,
      approved_on: new Date().toISOString(),
      via_channel: "auto",
      approved_by_other_name: u.shortName,
      notes: "Auto-approved on PO # entry",
      recorded_by_user_id: u.userId,
    });
    if (error) console.warn("[store] auto-create customer_po_approval failed", error.message);
  };

  const moveCard = useCallback<PipelineStoreCtx["moveCard"]>(async (cardId, target) => {
    const proj = projectsRef.current.find((p) => p.id === cardId);
    if (!proj) return { ok: false };
    // Note: validateMove() is still exported and used by callers (Index.tsx) to
    // surface a non-blocking warning toast on forward moves with missing fields.
    // The store itself no longer blocks the move — softening per product decision.

    const u = userRef.current;
    const nowStageTs = new Date();
    const patch: Partial<Project> = { pipeline: target.pipeline, stage: target.stage, stageEnteredAt: nowStageTs };
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
    if (ok && !isUndoing()) {
      const fromPipeline = proj.pipeline;
      const fromStage = proj.stage;
      const prevShipmentId = proj.shipmentId;
      const prevStageEnteredAt = proj.stageEnteredAt;
      pushUndo({
        id: makeUndoId(),
        timestamp: Date.now(),
        description: `moved ${proj.projectName} to ${toLabel}`,
        originalLogId: res.entry.id,
        originalDescription: res.entry.description,
        applyInverse: async () => {
          const current = projectsRef.current.find((p) => p.id === cardId);
          if (!current) return { ok: false, reason: "Can't undo — project no longer exists" };
          const mover = apiRef.current.moveCard;
          if (!mover) return { ok: false, reason: "Undo unavailable" };
          const moved = await mover(cardId, { pipeline: fromPipeline, stage: fromStage });
          if (!moved.ok) return { ok: false, reason: "Couldn't restore stage" };
          if (prevShipmentId !== current.shipmentId) {
            await apiRef.current.updateProject?.(cardId, { shipmentId: prevShipmentId } as any);
          }
          // Restore the prior stage_entered_at so the column doesn't show
          // "just now" after an undo. stageEnteredAt is not in FIELD_LABELS
          // so this update produces no audit entry.
          await apiRef.current.updateProject?.(cardId, { stageEnteredAt: prevStageEnteredAt } as any);
          return { ok: true };
        },
      });
    }
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
    const ok = await commitProjectChange(next, newEntries);
    if (ok && !isUndoing() && newEntries.length) {
      // Capture before-values only for keys actually changed (those that
      // produced an audit entry, via FIELD_LABELS).
      const beforePatch: Partial<Project> = {};
      for (const e of newEntries) {
        const field = (e.metadata as any)?.field as keyof Project | undefined;
        if (field) (beforePatch as any)[field] = (proj as any)[field] ?? null;
      }
      if (Object.keys(beforePatch).length) {
        const first = newEntries[0];
        const friendly = newEntries.length === 1
          ? first.description.replace(/^[^\s]+\s/, "") // strip leading actor token
          : `${newEntries.length} field changes on ${proj.projectName}`;
        pushUndo({
          id: makeUndoId(),
          timestamp: Date.now(),
          description: friendly,
          originalLogId: first.id,
          originalDescription: first.description,
          applyInverse: async () => {
            const exists = projectsRef.current.find((p) => p.id === id);
            if (!exists) return { ok: false, reason: "Can't undo — project no longer exists" };
            await apiRef.current.updateProject?.(id, beforePatch);
            return { ok: true };
          },
        });
      }
    }
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
      return;
    }
    if (!isUndoing()) {
      pushUndo({
        id: makeUndoId(), timestamp: Date.now(),
        description: `added a note to ${proj.projectName}`,
        originalLogId: r.entry.id, originalDescription: r.entry.description,
        applyInverse: async () => {
          const exists = projectsRef.current.find((p) => p.id === projectId);
          if (!exists) return { ok: false, reason: "Can't undo — project no longer exists" };
          const stillThere = (exists.notes ?? []).some((n) => n.id === note.id);
          if (!stillThere) return { ok: false, reason: "Already removed" };
          await apiRef.current.removeNote?.(projectId, note.id);
          return { ok: true };
        },
      });
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
    if (lErr) { setProjects(snapshot); toast.error(FAILURE_TOAST); return; }
    if (!isUndoing()) {
      const oldText = oldNote.text;
      pushUndo({
        id: makeUndoId(), timestamp: Date.now(),
        description: `edited a note on ${proj.projectName}`,
        originalLogId: r.entry.id, originalDescription: r.entry.description,
        applyInverse: async () => {
          const exists = projectsRef.current.find((p) => p.id === projectId);
          if (!exists) return { ok: false, reason: "Can't undo — project no longer exists" };
          const still = (exists.notes ?? []).some((n) => n.id === noteId);
          if (!still) return { ok: false, reason: "Can't undo — note no longer exists" };
          await apiRef.current.updateNote?.(projectId, noteId, oldText);
          return { ok: true };
        },
      });
    }
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
    if (lErr) { setProjects(snapshot); toast.error(FAILURE_TOAST); return; }
    if (!isUndoing()) {
      const fullNote = removed;
      pushUndo({
        id: makeUndoId(), timestamp: Date.now(),
        description: `deleted a note from ${proj.projectName}`,
        originalLogId: r.entry.id, originalDescription: r.entry.description,
        applyInverse: async () => {
          const exists = projectsRef.current.find((p) => p.id === projectId);
          if (!exists) return { ok: false, reason: "Can't undo — project no longer exists" };
          await apiRef.current.restoreNote?.(projectId, fullNote);
          return { ok: true };
        },
      });
    }
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
    if (!isUndoing()) {
      const addedAtIndex = items.length - 1;
      const itemSig = `${item.qty}|${item.description}|${item.unitPrice ?? ""}`;
      pushUndo({
        id: makeUndoId(), timestamp: Date.now(),
        description: `added line item to ${proj.projectName}`,
        originalLogId: r.entry.id, originalDescription: r.entry.description,
        applyInverse: async () => {
          const exists = projectsRef.current.find((p) => p.id === projectId);
          if (!exists) return { ok: false, reason: "Can't undo — project no longer exists" };
          const list = exists.lineItems ?? [];
          let idx = list.findIndex((li, i) => i >= addedAtIndex && `${li.qty}|${li.description}|${li.unitPrice ?? ""}` === itemSig);
          if (idx < 0) idx = list.findIndex((li) => `${li.qty}|${li.description}|${li.unitPrice ?? ""}` === itemSig);
          if (idx < 0) return { ok: false, reason: "Already removed" };
          await apiRef.current.removeLineItem?.(projectId, idx);
          return { ok: true };
        },
      });
    }
  }, []);

  const updateLineItem = useCallback(async (projectId: string, index: number, item: LineItem) => {
    const proj = projectsRef.current.find((p) => p.id === projectId); if (!proj) return;
    const items = [...(proj.lineItems ?? [])];
    if (index < 0 || index >= items.length) return;
    const before = items[index];
    items[index] = item;
    const next = touch({ ...proj, lineItems: items });
    const u = userRef.current;
    const r = appendLog(next, { actor: actorOf(u), actionType: "line_item_change",
      description: `${u.shortName} edited line item ${item.qty} × ${item.description}` });
    await persistLineItemsAndCommit(projectId, items, r.project, r.entry);
    if (!isUndoing()) {
      const capturedIndex = index;
      const beforeItem = before;
      pushUndo({
        id: makeUndoId(), timestamp: Date.now(),
        description: `edited line item on ${proj.projectName}`,
        originalLogId: r.entry.id, originalDescription: r.entry.description,
        applyInverse: async () => {
          const exists = projectsRef.current.find((p) => p.id === projectId);
          if (!exists) return { ok: false, reason: "Can't undo — project no longer exists" };
          const list = exists.lineItems ?? [];
          if (capturedIndex >= list.length) return { ok: false, reason: "Can't undo — line item no longer exists" };
          await apiRef.current.updateLineItem?.(projectId, capturedIndex, beforeItem);
          return { ok: true };
        },
      });
    }
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
    if (!isUndoing()) {
      const fullItem = removed;
      pushUndo({
        id: makeUndoId(), timestamp: Date.now(),
        description: `deleted line item from ${proj.projectName}`,
        originalLogId: r.entry.id, originalDescription: r.entry.description,
        applyInverse: async () => {
          const exists = projectsRef.current.find((p) => p.id === projectId);
          if (!exists) return { ok: false, reason: "Can't undo — project no longer exists" };
          await apiRef.current.addLineItem?.(projectId, fullItem);
          return { ok: true };
        },
      });
    }
  }, []);

  const duplicateProject = useCallback(async (projectId: string): Promise<Project | null> => {
    const orig = projectsRef.current.find((p) => p.id === projectId);
    if (!orig) return null;
    const u = userRef.current;
    let copy: Project = {
      ...orig,
      id: `prj-dup-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      projectName: `${orig.projectName} (Copy)`,
      // Document numbers — duplicates start clean (each is scoped to its own quote/order context).
      quoteNumber: undefined, poNumber: undefined, invoiceNumber: undefined, proofNumber: undefined,
      customerPoNumber: undefined,
      // Money/value — duplicate starts at no value.
      value: 0,
      // Deposit fields — scoped to original order.
      depositRequired: false, depositInvoiceNumber: undefined, depositAmount: undefined,
      depositPaidDate: undefined, depositPaidMethod: undefined, depositPaymentReference: undefined,
      // Invoice + payment capture — scoped to original order.
      paidOnDate: undefined, paymentMethod: undefined, paymentReference: undefined,
      invoiceIssuedDate: undefined, invoiceIssuedDateAssumed: undefined,
      // Payment terms re-inherit from customer default on next save.
      paymentTerms: undefined, paymentTermsCustomDays: undefined, paymentTermsInherited: undefined,
      // Supplier-side (PO/amount/currency/supplier) — scoped to a particular order; start clean.
      poAmount: undefined, poAmountCurrency: undefined, supplierId: undefined, supplierLabel: undefined,
      // Email/verbal approval (legacy fields still present on row) — clear.
      emailVerbalApproved: false, emailVerbalApprovedAt: undefined, emailVerbalApprovedByBuyerId: undefined,
      emailVerbalApprovedViaChannel: undefined, emailVerbalApprovedOtherName: undefined,
      emailVerbalApprovedNotes: undefined, emailVerbalApprovedRecordedByUserId: undefined,
      // Per-project gate overrides — start at defaults.
      orderConfirmationOverrides: undefined,
      // Notes / line items / shipment — not carried.
      shipmentId: undefined, notes: undefined, lineItems: undefined,
      // Per existing spec: duplicate clears shipping mode, shipment #, and tracking ref.
      shippingMode: undefined, shipmentNumber: undefined, trackingRef: undefined,
      pipeline: orig.pipeline, stage: orig.stage, flagged: false,
      deletedAt: undefined, deletedFromPipeline: undefined, deletedFromStage: undefined,
      createdAt: new Date(), updatedAt: undefined,
      stageEnteredAt: new Date(),
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
      stageEnteredAt: new Date(),
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

  const findProjectsByDocField = useCallback(
    (
      field: "quoteNumber" | "poNumber" | "invoiceNumber" | "proofNumber" | "depositInvoiceNumber",
      value: string | null | undefined,
      exceptId: string,
    ): Project[] => {
      if (!value) return [];
      return projects.filter(
        (p) => !p.deletedAt && p.id !== exceptId && (p[field] ?? null) === value,
      );
    },
    [projects],
  );

  const assignToShipment = useCallback(async (projectId: string, shipmentId: string) => {
    const ship = shipmentsRef.current.find((s) => s.id === shipmentId);
    const proj = projectsRef.current.find((p) => p.id === projectId);
    if (!ship || !proj) return;
    const u = userRef.current;
    const next = touch({ ...proj, shipmentId, pipeline: "shipping" as const, stage: "shipment_assigned" as const, shippingMode: ship.mode, stageEnteredAt: new Date() });
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
      const patch: Partial<Project> = { pipeline: "finance", stage: "invoice_required", stageEnteredAt: new Date() };
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
    findProjectsByDocField,
    assignToShipment, createShipment, updateShipment, markShipmentDelivered,
    pulsePipeline, triggerPulse,
  }), [liveProjects, trashedProjects, archivedProjects, shipments, suppliers, loading, moveCard, updateProject, renameProject, addNote, updateNote, removeNote, restoreNote, addLineItem, updateLineItem, removeLineItem, duplicateProject, createProject, toggleFlag, softDeleteProject, restoreProject, hardDeleteProject, deleteProject, addSupplier, findProjectsByDocField, assignToShipment, createShipment, updateShipment, markShipmentDelivered, pulsePipeline, triggerPulse]);


  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const usePipelineStore = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePipelineStore must be used inside PipelineStoreProvider");
  return ctx;
};
