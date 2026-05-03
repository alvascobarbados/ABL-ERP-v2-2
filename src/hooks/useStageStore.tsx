import { createContext, useCallback, useContext, useMemo, useRef, useState, ReactNode } from "react";
import {
  STATES, StageId, StateId, Project, Shipment, Supplier, ProjectNote, LineItem,
  ProjectLogEntry, ProjectLogActionType,
  SHIPMENTS as SEED_SHIPMENTS, SUPPLIERS, ShippingMode,
} from "@/data/states";
import { ABL_PROJECTS as SEED_PROJECTS } from "@/data/abl-projects";
import { useCurrentUser, SYSTEM_CURRENT_USER, type CurrentUser } from "./useCurrentUser";

// ─────────── Log helpers ───────────
function makeLogId() {
  return `log-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function appendLog(p: Project, entry: Omit<ProjectLogEntry, "id" | "ts"> & { ts?: Date }): Project {
  const full: ProjectLogEntry = {
    id: makeLogId(),
    ts: entry.ts ?? new Date(),
    actor: entry.actor,
    actionType: entry.actionType,
    description: entry.description,
    metadata: entry.metadata,
  };
  return { ...p, log: [...(p.log ?? []), full] };
}

function actorOf(u: CurrentUser) {
  return { userId: u.userId, displayName: u.shortName };
}

function stageStageLabel(state: StageId, state: StateId): string {
  const p = STATES.find((x) => x.id === state);
  const s = p?.states.find((x) => x.id === state);
  return `${p?.title ?? state} · ${s?.title ?? state}`;
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
  "state", "state", "flagged",
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


// ─────────── State helpers ───────────
export interface StatePos {
  state: StageId;
  state: StateId;
  stageIndex: number;
  stateIndex: number;
}

export const ALL_STAGES: { state: StageId; state: StateId; title: string; stageTitle: string }[] =
  STATES.flatMap((p) => p.states.map((s) => ({ state: p.id, state: s.id, title: s.title, stageTitle: p.title })));

export function getStagePos(state: StageId, state: StateId): StatePos {
  const stageIndex = STATES.findIndex((p) => p.id === state);
  const stateIndex = STATES[stageIndex].states.findIndex((s) => s.id === state);
  return { state, state, stageIndex, stateIndex };
}

export function getStageTitle(state: StageId, state: StateId): string {
  return STATES.find((p) => p.id === state)?.states.find((s) => s.id === state)?.title ?? state;
}

function forwardStages(state: StageId): StateId[] {
  const p = STATES.find((x) => x.id === state)!;
  if (state === "sales") return p.states.filter((s) => s.id !== "archive").map((s) => s.id);
  if (state === "shipping") return ["shipment_assigned"];
  return p.states.map((s) => s.id);
}

export function getNextStage(state: StageId, state: StateId): { state: StageId; state: StateId } | null {
  if (state === "shipping") {
    if (state === "shipment_required") return { state: "shipping", state: "shipment_assigned" };
    if (state === "shipment_assigned") return { state: "finance", state: "invoice_required" };
    return null;
  }
  const states = forwardStages(state);
  const idx = states.indexOf(state);
  if (idx >= 0 && idx < states.length - 1) {
    return { state, state: states[idx + 1] };
  }
  const pi = STATES.findIndex((x) => x.id === state);
  if (pi < STATES.length - 1) {
    const next = STATES[pi + 1];
    if (next.id === "shipping") return { state: "shipping", state: "shipment_required" };
    return { state: next.id, state: next.states[0].id };
  }
  return null;
}

export function getPrevStage(state: StageId, state: StateId): { state: StageId; state: StateId } | null {
  if (state === "shipping") {
    if (state === "shipment_assigned" || state === "shipment_required") {
      return { state: "operations", state: "in_production" };
    }
    return null;
  }
  const states = forwardStages(state);
  const idx = states.indexOf(state);
  if (idx > 0) return { state, state: states[idx - 1] };
  const pi = STATES.findIndex((x) => x.id === state);
  if (pi > 0) {
    const prev = STATES[pi - 1];
    if (prev.id === "shipping") return { state: "shipping", state: "shipment_assigned" };
    const prevStages = forwardStages(prev.id);
    return { state: prev.id, state: prevStages[prevStages.length - 1] };
  }
  return null;
}

// ─────────── Validation ───────────
export interface MoveValidation {
  ok: boolean;
  missing: ("detailSummary" | "supplier" | "shippingMode")[];
}

/** Validates that a project has the required fields to enter `target`. */
export function validateMove(project: Project, target: { state: StageId; state: StateId }): MoveValidation {
  // Anything past Sales/Confirming requires detail summary + supplier + shipping mode.
  const STATE_GATE_ORDER: StateId[] = [
    "proposal", "quote", "confirming",
    "design", "proof",
    "preproduction", "in_production",
    "shipment_required", "shipment_assigned",
    "invoice_required", "invoiced", "paid",
  ];
  const targetIdx = STATE_GATE_ORDER.indexOf(target.state);
  // Design + Proof are pre-production handoff states; treat them like
  // Confirming for validation purposes (no supplier/shipping requirement).
  const gateIdx = STATE_GATE_ORDER.indexOf("proof");
  if (target.state === "archive") return { ok: true, missing: [] };
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

interface StageStoreCtx {
  /** Live projects only — trashed projects are filtered out. Includes archived projects (sales/archive). */
  projects: Project[];
  /** Soft-deleted projects (in Trash). */
  trashedProjects: Project[];
  /** Projects sitting in sales/archive — excluded from state views/counts; surfaced in ArchiveView. */
  archivedProjects: Project[];
  shipments: Shipment[];
  suppliers: Supplier[];
  moveCard: (cardId: string, target: { state: StageId; state: StateId }) => MoveResult;
  updateProject: (id: string, patch: Partial<Project>) => void;
  renameProject: (currentName: string, newName: string) => { count: number };
  addNote: (projectId: string, text: string, author?: string) => void;
  addLineItem: (projectId: string, item: LineItem) => void;
  updateLineItem: (projectId: string, index: number, item: LineItem) => void;
  removeLineItem: (projectId: string, index: number) => void;
  duplicateProject: (projectId: string) => Project | null;
  /** Create a brand-new project (lands in Sales · Proposal). */
  createProject: (input: { customer: string; projectName: string; detailSummary?: string; pointPerson?: string }) => Project;
  /** Toggle the "needs attention" flag on a project. */
  toggleFlag: (projectId: string) => void;
  /** Soft-delete: send to Trash. */
  softDeleteProject: (projectId: string) => { restoredFrom: { state: StageId; state: StateId } } | null;
  /** Restore a trashed project to its original state/state. */
  restoreProject: (projectId: string) => { state: StageId; state: StateId } | null;
  /** Permanently remove a project from the database. */
  hardDeleteProject: (projectId: string) => void;
  /** @deprecated use softDeleteProject for the trash flow. */
  deleteProject: (projectId: string) => void;
  addSupplier: (input: { name: string; country: string; defaultShippingMode: ShippingMode }) => Supplier;
  isQuoteNumberDuplicate: (number: string, exceptProjectId: string) => boolean;
  isPONumberDuplicate: (number: string, exceptProjectId: string) => boolean;
  isInvoiceNumberDuplicate: (number: string, exceptProjectId: string) => boolean;
  assignToShipment: (projectId: string, shipmentId: string) => void;
  createShipment: (input: NewShipmentInput) => Shipment;
  updateShipment: (id: string, patch: Partial<Shipment>) => void;
  markShipmentDelivered: (shipmentId: string) => { count: number };
  pulsePipeline: StageId | null;
  triggerPulse: (id: StageId) => void;
}

const Ctx = createContext<StageStoreCtx | null>(null);

export const StageStoreProvider = ({ children }: { children: ReactNode }) => {
  const [projects, setProjects] = useState<Project[]>(() =>
    // Defensive migration: any project lingering on the retired
    // "shipment_delivered" state (or any other unknown shipping state)
    // moves to Finance · Invoice Required. Shipping no longer has states.
    SEED_PROJECTS.map((p, i) => {
      const s = p.state as string;
      let next: Project = { ...p };
      if (p.state === "shipping" &&
          s !== "shipment_required" && s !== "shipment_assigned") {
        next = { ...next, state: "finance" as const, state: "invoice_required" as const };
      }
      // ── Payment-terms / invoice-tracking defaults for seed data ──
      if (!next.paymentTerms) {
        next.paymentTerms = "Net 30";
        next.paymentTermsInherited = true;
      }
      if (next.state === "finance") {
        const now = Date.now();
        if (next.state === "invoice_required" && !next.invoiceRequiredEnteredAt) {
          // 1–22d ago, deterministic per-index
          const off = ((i * 13 + 5) % 22) + 1;
          next.invoiceRequiredEnteredAt = new Date(now - off * 86400000);
        }
        if ((next.state === "invoiced" || next.state === "paid") && !next.invoiceIssuedDate) {
          const base = next.state === "paid" ? 30 : 12;
          const jitter = ((i * 7 + 3) % 18) - 4;
          const days = Math.max(1, base + jitter);
          next.invoiceIssuedDate = new Date(now - days * 86400000);
          next.invoiceIssuedDateAssumed = true;
        }
      }
      // Seed the immutable log with a "project created" entry, attributed to
      // the migration. Real future creations write the same kind of entry.
      if (!next.log || next.log.length === 0) {
        next = appendLog(next, {
          ts: next.createdAt,
          actor: actorOf(SYSTEM_CURRENT_USER),
          actionType: "project_created",
          description: `${SYSTEM_CURRENT_USER.shortName} created this project`,
        });
      }
      return next;
    }),
  );
  const [shipments, setShipments] = useState<Shipment[]>(() => SEED_SHIPMENTS.map((s) => ({ ...s })));
  const [suppliers, setSuppliers] = useState<Supplier[]>(() => SUPPLIERS.map((s) => ({ ...s })));
  const currentUser = useCurrentUser();
  // Refs so callbacks see the latest values without retriggering.
  const userRef = useRef(currentUser); userRef.current = currentUser;
  const suppliersRef = useRef(suppliers); suppliersRef.current = suppliers;
  const [pulsePipeline, setPulsePipeline] = useState<StageId | null>(null);
  const pulseTimer = useRef<number | null>(null);

  const triggerPulse = useCallback((id: StageId) => {
    setPulsePipeline(id);
    if (pulseTimer.current) window.clearTimeout(pulseTimer.current);
    pulseTimer.current = window.setTimeout(() => setPulsePipeline(null), 900);
  }, []);

  // Bump `updatedAt` on every project mutation. Spreadsheet view sorts by this.
  const touch = (p: Project): Project => ({ ...p, updatedAt: new Date() });

  const moveCard = useCallback<StageStoreCtx["moveCard"]>((cardId, target) => {
    const proj = projects.find((p) => p.id === cardId);
    if (!proj) return { ok: false };

    const v = validateMove(proj, target);
    if (!v.ok) return { blocked: { reason: "missing-fields", missing: v.missing } };

    setProjects((prev) => prev.map((p) => {
      if (p.id !== cardId) return p;
      const patch: Partial<Project> = { state: target.state, state: target.state };
      if (target.state === "shipping" && target.state === "shipment_required") {
        patch.shipmentId = undefined;
      }
      if (target.state === "quote" && !p.quoteNumber) {
        patch.quoteNumber = `Q-${2040 + Math.floor(Math.random() * 41)}`;
      }
      if (target.state === "operations" && !p.poNumber) {
        patch.poNumber = `PO-${1080 + Math.floor(Math.random() * 31)}`;
      }
      if (target.state === "finance" && !p.invoiceNumber) {
        patch.invoiceNumber = `INV-${1040 + Math.floor(Math.random() * 21)}`;
      }
      if (target.state === "finance" && target.state === "invoice_required"
          && !p.invoiceRequiredEnteredAt) {
        patch.invoiceRequiredEnteredAt = new Date();
      }
      if (target.state === "finance" && target.state === "invoiced"
          && !p.invoiceIssuedDate) {
        patch.invoiceIssuedDate = new Date();
        patch.invoiceIssuedDateAssumed = true;
      }
      const u = userRef.current;
      const fromLabel = stageStageLabel(p.state, p.state);
      const toLabel = stageStageLabel(target.state, target.state);
      const isPaid = target.state === "finance" && target.state === "paid";
      const isArchive = target.state === "sales" && target.state === "archive";
      const wasArchive = p.state === "sales" && p.state === "archive";
      let next = touch({ ...p, ...patch });
      if (isPaid) {
        next = appendLog(next, {
          actor: actorOf(u), actionType: "mark_paid",
          description: `${u.shortName} marked this paid`,
          metadata: { fromPipeline: p.state, fromStage: p.state, toPipeline: target.state, toStage: target.state },
        });
      } else if (isArchive) {
        next = appendLog(next, {
          actor: actorOf(u), actionType: "archive",
          description: `${u.shortName} archived this`,
          metadata: { fromPipeline: p.state, fromStage: p.state },
        });
      } else if (wasArchive) {
        next = appendLog(next, {
          actor: actorOf(u), actionType: "unarchive",
          description: `${u.shortName} restored this from archive`,
          metadata: { toPipeline: target.state, toStage: target.state },
        });
      } else {
        next = appendLog(next, {
          actor: actorOf(u), actionType: "state_change",
          description: `${u.shortName} moved this from ${fromLabel} to ${toLabel}`,
          metadata: { fromPipeline: p.state, fromStage: p.state, toPipeline: target.state, toStage: target.state },
        });
      }
      return next;
    }));
    return { ok: true };
  }, [projects]);

  const updateProject = useCallback((id: string, patch: Partial<Project>) => {
    setProjects((prev) => prev.map((p) => {
      if (p.id !== id) return p;
      const u = userRef.current;
      const entries = buildFieldEditEntries(p, patch, u, suppliersRef.current);
      let next = touch({ ...p, ...patch });
      for (const e of entries) next = appendLog(next, e);
      return next;
    }));
  }, []);

  const renameProject = useCallback((currentName: string, newName: string) => {
    let count = 0;
    const u = userRef.current;
    setProjects((prev) => prev.map((p) => {
      if (p.projectName === currentName) {
        count += 1;
        return appendLog(touch({ ...p, projectName: newName }), {
          actor: actorOf(u), actionType: "field_edit",
          description: `${u.shortName} changed project name from ${currentName} to ${newName}`,
          metadata: { field: "projectName", fromValue: currentName, toValue: newName },
        });
      }
      return p;
    }));
    return { count };
  }, []);

  const addNote = useCallback((projectId: string, text: string, _author?: string) => {
    const u = userRef.current;
    const note: ProjectNote = {
      id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      ts: new Date(), author: u.fullName, authorUserId: u.userId, text,
    };
    setProjects((prev) => prev.map((p) => {
      if (p.id !== projectId) return p;
      let next = touch({ ...p, notes: [...(p.notes ?? []), note] });
      next = appendLog(next, {
        actor: actorOf(u), actionType: "note_added",
        description: `${u.shortName} added a note`,
      });
      return next;
    }));
  }, []);

  const addLineItem = useCallback((projectId: string, item: LineItem) => {
    setProjects((prev) => prev.map((p) => {
      if (p.id !== projectId) return p;
      const u = userRef.current;
      let next = touch({ ...p, lineItems: [...(p.lineItems ?? []), item] });
      next = appendLog(next, {
        actor: actorOf(u), actionType: "line_item_change",
        description: `${u.shortName} added line item ${item.qty} × ${item.description}`,
      });
      return next;
    }));
  }, []);

  const updateLineItem = useCallback((projectId: string, index: number, item: LineItem) => {
    setProjects((prev) => prev.map((p) => {
      if (p.id !== projectId) return p;
      const items = [...(p.lineItems ?? [])];
      if (index < 0 || index >= items.length) return p;
      items[index] = item;
      const u = userRef.current;
      let next = touch({ ...p, lineItems: items });
      next = appendLog(next, {
        actor: actorOf(u), actionType: "line_item_change",
        description: `${u.shortName} edited line item ${item.qty} × ${item.description}`,
      });
      return next;
    }));
  }, []);

  const removeLineItem = useCallback((projectId: string, index: number) => {
    setProjects((prev) => prev.map((p) => {
      if (p.id !== projectId) return p;
      const items = [...(p.lineItems ?? [])];
      if (index < 0 || index >= items.length) return p;
      const removed = items[index];
      items.splice(index, 1);
      const u = userRef.current;
      let next = touch({ ...p, lineItems: items });
      next = appendLog(next, {
        actor: actorOf(u), actionType: "line_item_change",
        description: `${u.shortName} removed line item ${removed.qty} × ${removed.description}`,
      });
      return next;
    }));
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
      state: orig.state,
      state: orig.state,
      flagged: false,
      deletedAt: undefined,
      deletedFromPipeline: undefined,
      deletedFromStage: undefined,
      createdAt: new Date(),
      updatedAt: undefined,
    };
    copy = appendLog(copy, {
      actor: actorOf(u), actionType: "project_created",
      description: `${u.shortName} duplicated this from ${orig.projectName}`,
    });
    setProjects((prev) => [copy, ...prev]);
    return copy;
  }, [projects]);

  const createProject = useCallback<StageStoreCtx["createProject"]>((input) => {
    const u = userRef.current;
    let newProj: Project = {
      id: `prj-new-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      customer: input.customer,
      projectName: input.projectName,
      detailSummary: input.detailSummary,
      pointPerson: input.pointPerson ?? "AV",
      state: "sales",
      state: "proposal",
      deadline: "—",
      deadlineDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      value: 0,
      orderType: "New",
      priority: "Standard",
      createdAt: new Date(),
      paymentTerms: "Net 30",
      paymentTermsInherited: true,
    };
    newProj = appendLog(newProj, {
      actor: actorOf(u), actionType: "project_created",
      description: `${u.shortName} created this project`,
    });
    setProjects((prev) => [newProj, ...prev]);
    return newProj;
  }, []);

  const toggleFlag = useCallback<StageStoreCtx["toggleFlag"]>((projectId) => {
    setProjects((prev) => prev.map((p) => {
      if (p.id !== projectId) return p;
      const u = userRef.current;
      const next = touch({ ...p, flagged: !p.flagged });
      return appendLog(next, {
        actor: actorOf(u), actionType: "flag_toggle",
        description: !p.flagged ? `${u.shortName} flagged this` : `${u.shortName} unflagged this`,
      });
    }));
  }, []);

  // ── Trash (soft-delete) ────────────────────────────────────────────────
  const TRASH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

  const softDeleteProject = useCallback<StageStoreCtx["softDeleteProject"]>((projectId) => {
    const orig = projects.find((p) => p.id === projectId && !p.deletedAt);
    if (!orig) return null;
    const restoredFrom = { state: orig.state, state: orig.state };
    const u = userRef.current;
    setProjects((prev) => prev.map((p) =>
      p.id === projectId
        ? appendLog(
            { ...p, deletedAt: new Date(), deletedFromPipeline: orig.state, deletedFromStage: orig.state },
            { actor: actorOf(u), actionType: "trash", description: `${u.shortName} moved this to Trash` },
          )
        : p,
    ));
    return { restoredFrom };
  }, [projects]);

  const restoreProject = useCallback<StageStoreCtx["restoreProject"]>((projectId) => {
    const orig = projects.find((p) => p.id === projectId && p.deletedAt);
    if (!orig) return null;
    const knownStages: StateId[] = STATES.flatMap((pp) => pp.states.map((s) => s.id));
    const targetPipeline: StageId = orig.deletedFromPipeline ?? orig.state ?? "sales";
    const fallbackStage: Record<StageId, StateId> = {
      sales: "quote", design: "design", operations: "preproduction",
      shipping: "shipment_required", finance: "invoice_required",
    };
    const targetStage: StateId =
      orig.deletedFromStage && knownStages.includes(orig.deletedFromStage)
        ? orig.deletedFromStage
        : fallbackStage[targetPipeline];
    const u = userRef.current;
    setProjects((prev) => prev.map((p) =>
      p.id === projectId
        ? appendLog(
            { ...p, state: targetPipeline, state: targetStage,
              deletedAt: undefined, deletedFromPipeline: undefined, deletedFromStage: undefined },
            { actor: actorOf(u), actionType: "restore", description: `${u.shortName} restored this from Trash` },
          )
        : p,
    ));
    return { state: targetPipeline, state: targetStage };
  }, [projects]);

  const hardDeleteProject = useCallback((projectId: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
  }, []);

  // Back-compat alias — old call sites still use deleteProject (now soft).
  const deleteProject = useCallback((projectId: string) => {
    softDeleteProject(projectId);
  }, [softDeleteProject]);

  // Auto-purge expired trash entries (>30d) once on mount.
  useState(() => {
    const cutoff = Date.now() - TRASH_TTL_MS;
    setProjects((prev) => prev.filter((p) => !p.deletedAt || p.deletedAt.getTime() > cutoff));
    return undefined;
  });

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
    setProjects((prev) => prev.map((p) => {
      if (p.id !== projectId) return p;
      const next = touch({ ...p, shipmentId, state: "shipping" as const, state: "shipment_assigned" as const, shippingMode: ship.mode });
      return appendLog(next, {
        actor: actorOf(u), actionType: "state_change",
        description: `${u.shortName} assigned this to shipment ${ship.code}`,
        metadata: { fromPipeline: p.state, fromStage: p.state, toPipeline: "shipping", toStage: "shipment_assigned" },
      });
    }));
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
    return newShip;
  }, []);

  const updateShipment = useCallback((id: string, patch: Partial<Shipment>) => {
    setShipments((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    setProjects((prev) => prev.map((p) => (p.shipmentId === id ? touch(p) : p)));
  }, []);

  const markShipmentDelivered = useCallback((shipmentId: string) => {
    let count = 0;
    const u = userRef.current;
    setProjects((prev) => prev.map((p) => {
      if (p.shipmentId === shipmentId && p.state === "shipping") {
        count += 1;
        const patch: Partial<Project> = { state: "finance", state: "invoice_required" };
        if (!p.invoiceNumber) patch.invoiceNumber = `INV-${1500 + Math.floor(Math.random() * 800)}`;
        const next = touch({ ...p, ...patch });
        return appendLog(next, {
          actor: actorOf(u), actionType: "state_change",
          description: `${u.shortName} marked shipment delivered`,
          metadata: { fromPipeline: p.state, fromStage: p.state, toPipeline: "finance", toStage: "invoice_required" },
        });
      }
      return p;
    }));
    setShipments((prev) => prev.map((s) => s.id === shipmentId ? { ...s, status: "Delivered" } : s));
    return { count };
  }, []);

  const liveProjects = useMemo(() => projects.filter((p) => !p.deletedAt), [projects]);
  const trashedProjects = useMemo(
    () => projects.filter((p) => !!p.deletedAt)
      .sort((a, b) => (b.deletedAt!.getTime() - a.deletedAt!.getTime())),
    [projects],
  );
  const archivedProjects = useMemo(
    () => liveProjects.filter((p) => p.state === "sales" && p.state === "archive"),
    [liveProjects],
  );

  const value = useMemo<StageStoreCtx>(() => ({
    projects: liveProjects, trashedProjects, archivedProjects, shipments, suppliers,
    moveCard, updateProject, renameProject, addNote,
    addLineItem, updateLineItem, removeLineItem,
    duplicateProject, createProject, toggleFlag,
    softDeleteProject, restoreProject, hardDeleteProject, deleteProject,
    addSupplier,
    isQuoteNumberDuplicate, isPONumberDuplicate, isInvoiceNumberDuplicate,
    assignToShipment, createShipment, updateShipment, markShipmentDelivered,
    pulsePipeline, triggerPulse,
  }), [liveProjects, trashedProjects, archivedProjects, shipments, suppliers, moveCard, updateProject, renameProject, addNote, addLineItem, updateLineItem, removeLineItem, duplicateProject, createProject, toggleFlag, softDeleteProject, restoreProject, hardDeleteProject, deleteProject, addSupplier, isQuoteNumberDuplicate, isPONumberDuplicate, isInvoiceNumberDuplicate, assignToShipment, createShipment, updateShipment, markShipmentDelivered, pulsePipeline, triggerPulse]);


  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const usePipelineStore = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePipelineStore must be used inside StageStoreProvider");
  return ctx;
};
