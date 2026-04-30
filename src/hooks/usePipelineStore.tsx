import { createContext, useCallback, useContext, useMemo, useRef, useState, ReactNode } from "react";
import {
  PIPELINES, PipelineId, StageId, Project, Shipment, Supplier, ProjectNote, LineItem,
  PROJECTS as SEED_PROJECTS, SHIPMENTS as SEED_SHIPMENTS, SUPPLIERS, ShippingMode,
} from "@/data/pipelines";

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

/** Validates that a project has the required fields to enter `target`. */
export function validateMove(project: Project, target: { pipeline: PipelineId; stage: StageId }): MoveValidation {
  // Anything past Sales/Confirming requires detail summary + supplier + shipping mode.
  const STAGE_GATE_ORDER: StageId[] = [
    "proposal", "quote", "confirming",
    "preproduction", "in_production",
    "shipment_required", "shipment_assigned",
    "invoice_required", "invoiced", "paid",
  ];
  const targetIdx = STAGE_GATE_ORDER.indexOf(target.stage);
  const confirmingIdx = STAGE_GATE_ORDER.indexOf("confirming");
  if (target.stage === "archive") return { ok: true, missing: [] };
  if (targetIdx <= confirmingIdx) return { ok: true, missing: [] };

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
  /** Live projects only — trashed projects are filtered out. */
  projects: Project[];
  /** Soft-deleted projects (in Trash). */
  trashedProjects: Project[];
  shipments: Shipment[];
  suppliers: Supplier[];
  moveCard: (cardId: string, target: { pipeline: PipelineId; stage: StageId }) => MoveResult;
  updateProject: (id: string, patch: Partial<Project>) => void;
  renameProject: (currentName: string, newName: string) => { count: number };
  addNote: (projectId: string, text: string, author?: string) => void;
  addLineItem: (projectId: string, item: LineItem) => void;
  updateLineItem: (projectId: string, index: number, item: LineItem) => void;
  removeLineItem: (projectId: string, index: number) => void;
  duplicateProject: (projectId: string) => Project | null;
  /** Soft-delete: send to Trash. */
  softDeleteProject: (projectId: string) => { restoredFrom: { pipeline: PipelineId; stage: StageId } } | null;
  /** Restore a trashed project to its original pipeline/stage. */
  restoreProject: (projectId: string) => { pipeline: PipelineId; stage: StageId } | null;
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
  markShipmentDelivered: (shipmentId: string) => { count: number };
  pulsePipeline: PipelineId | null;
  triggerPulse: (id: PipelineId) => void;
}

const Ctx = createContext<PipelineStoreCtx | null>(null);

export const PipelineStoreProvider = ({ children }: { children: ReactNode }) => {
  const [projects, setProjects] = useState<Project[]>(() =>
    // Defensive migration: any project lingering on the retired
    // "shipment_delivered" stage (or any other unknown shipping stage)
    // moves to Finance · Invoice Required. Shipping no longer has stages.
    SEED_PROJECTS.map((p) => {
      const s = p.stage as string;
      if (p.pipeline === "shipping" &&
          s !== "shipment_required" && s !== "shipment_assigned") {
        return { ...p, pipeline: "finance" as const, stage: "invoice_required" as const };
      }
      return { ...p };
    }),
  );
  const [shipments, setShipments] = useState<Shipment[]>(() => SEED_SHIPMENTS.map((s) => ({ ...s })));
  const [suppliers, setSuppliers] = useState<Supplier[]>(() => SUPPLIERS.map((s) => ({ ...s })));
  const [pulsePipeline, setPulsePipeline] = useState<PipelineId | null>(null);
  const pulseTimer = useRef<number | null>(null);

  const triggerPulse = useCallback((id: PipelineId) => {
    setPulsePipeline(id);
    if (pulseTimer.current) window.clearTimeout(pulseTimer.current);
    pulseTimer.current = window.setTimeout(() => setPulsePipeline(null), 900);
  }, []);

  const moveCard = useCallback<PipelineStoreCtx["moveCard"]>((cardId, target) => {
    const proj = projects.find((p) => p.id === cardId);
    if (!proj) return { ok: false };

    const v = validateMove(proj, target);
    if (!v.ok) return { blocked: { reason: "missing-fields", missing: v.missing } };

    setProjects((prev) => prev.map((p) => {
      if (p.id !== cardId) return p;
      const patch: Partial<Project> = { pipeline: target.pipeline, stage: target.stage };
      // Drop shipment when going back to intake
      if (target.pipeline === "shipping" && target.stage === "shipment_required") {
        patch.shipmentId = undefined;
      }
      // Auto-assign reference numbers when reaching gates (per spec ranges)
      if (target.stage === "quote" && !p.quoteNumber) {
        patch.quoteNumber = `Q-${2040 + Math.floor(Math.random() * 41)}`; // 2040–2080
      }
      if (target.pipeline === "operations" && !p.poNumber) {
        patch.poNumber = `PO-${1080 + Math.floor(Math.random() * 31)}`; // 1080–1110
      }
      if (target.pipeline === "finance" && !p.invoiceNumber) {
        patch.invoiceNumber = `INV-${1040 + Math.floor(Math.random() * 21)}`; // 1040–1060
      }
      return { ...p, ...patch };
    }));
    return { ok: true };
  }, [projects]);

  const updateProject = useCallback((id: string, patch: Partial<Project>) => {
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, []);

  const renameProject = useCallback((currentName: string, newName: string) => {
    let count = 0;
    setProjects((prev) => prev.map((p) => {
      if (p.projectName === currentName) { count += 1; return { ...p, projectName: newName }; }
      return p;
    }));
    return { count };
  }, []);

  const addNote = useCallback((projectId: string, text: string, author = "Av") => {
    const note: ProjectNote = { id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, ts: new Date(), author, text };
    setProjects((prev) => prev.map((p) => p.id === projectId ? { ...p, notes: [...(p.notes ?? []), note] } : p));
  }, []);

  const addLineItem = useCallback((projectId: string, item: LineItem) => {
    setProjects((prev) => prev.map((p) => p.id === projectId ? { ...p, lineItems: [...(p.lineItems ?? []), item] } : p));
  }, []);

  const updateLineItem = useCallback((projectId: string, index: number, item: LineItem) => {
    setProjects((prev) => prev.map((p) => {
      if (p.id !== projectId) return p;
      const items = [...(p.lineItems ?? [])];
      if (index < 0 || index >= items.length) return p;
      items[index] = item;
      return { ...p, lineItems: items };
    }));
  }, []);

  const removeLineItem = useCallback((projectId: string, index: number) => {
    setProjects((prev) => prev.map((p) => {
      if (p.id !== projectId) return p;
      const items = [...(p.lineItems ?? [])];
      if (index < 0 || index >= items.length) return p;
      items.splice(index, 1);
      return { ...p, lineItems: items };
    }));
  }, []);

  const duplicateProject = useCallback((projectId: string): Project | null => {
    const orig = projects.find((p) => p.id === projectId);
    if (!orig) return null;
    const copy: Project = {
      ...orig,
      id: `prj-dup-${Date.now()}`,
      quoteNumber: undefined,
      poNumber: undefined,
      invoiceNumber: undefined,
      shipmentId: undefined,
      notes: undefined,
      lineItems: undefined,
      pipeline: "sales",
      stage: "proposal",
    };
    setProjects((prev) => [copy, ...prev]);
    return copy;
  }, [projects]);

  // ── Trash (soft-delete) ────────────────────────────────────────────────
  const TRASH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

  const softDeleteProject = useCallback<PipelineStoreCtx["softDeleteProject"]>((projectId) => {
    const orig = projects.find((p) => p.id === projectId && !p.deletedAt);
    if (!orig) return null;
    const restoredFrom = { pipeline: orig.pipeline, stage: orig.stage };
    setProjects((prev) => prev.map((p) =>
      p.id === projectId
        ? { ...p, deletedAt: new Date(), deletedFromPipeline: orig.pipeline, deletedFromStage: orig.stage }
        : p,
    ));
    return { restoredFrom };
  }, [projects]);

  const restoreProject = useCallback<PipelineStoreCtx["restoreProject"]>((projectId) => {
    const orig = projects.find((p) => p.id === projectId && p.deletedAt);
    if (!orig) return null;
    // Pipelines/stages can change over time. If the original stage is gone,
    // fall back to a sensible default per pipeline.
    const knownStages: StageId[] = PIPELINES.flatMap((pp) => pp.stages.map((s) => s.id));
    const targetPipeline: PipelineId = orig.deletedFromPipeline ?? orig.pipeline ?? "sales";
    const fallbackStage: Record<PipelineId, StageId> = {
      sales: "quote", operations: "preproduction",
      shipping: "shipment_required", finance: "invoice_required",
    };
    const targetStage: StageId =
      orig.deletedFromStage && knownStages.includes(orig.deletedFromStage)
        ? orig.deletedFromStage
        : fallbackStage[targetPipeline];
    setProjects((prev) => prev.map((p) =>
      p.id === projectId
        ? { ...p, pipeline: targetPipeline, stage: targetStage,
            deletedAt: undefined, deletedFromPipeline: undefined, deletedFromStage: undefined }
        : p,
    ));
    return { pipeline: targetPipeline, stage: targetStage };
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
    setProjects((prev) => prev.map((p) => p.id === projectId
      ? { ...p, shipmentId, pipeline: "shipping", stage: "shipment_assigned", shippingMode: ship.mode }
      : p));
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

  const markShipmentDelivered = useCallback((shipmentId: string) => {
    let count = 0;
    setProjects((prev) => prev.map((p) => {
      if (p.shipmentId === shipmentId && p.pipeline === "shipping") {
        count += 1;
        const patch: Partial<Project> = { pipeline: "finance", stage: "invoice_required" };
        if (!p.invoiceNumber) patch.invoiceNumber = `INV-${1500 + Math.floor(Math.random() * 800)}`;
        return { ...p, ...patch };
      }
      return p;
    }));
    setShipments((prev) => prev.map((s) => s.id === shipmentId ? { ...s, status: "Delivered" } : s));
    return { count };
  }, []);

  const value = useMemo<PipelineStoreCtx>(() => ({
    projects, shipments, suppliers,
    moveCard, updateProject, renameProject, addNote,
    addLineItem, updateLineItem, removeLineItem,
    duplicateProject, deleteProject, addSupplier,
    isQuoteNumberDuplicate, isPONumberDuplicate, isInvoiceNumberDuplicate,
    assignToShipment, createShipment, markShipmentDelivered,
    pulsePipeline, triggerPulse,
  }), [projects, shipments, suppliers, moveCard, updateProject, renameProject, addNote, addLineItem, updateLineItem, removeLineItem, duplicateProject, deleteProject, addSupplier, isQuoteNumberDuplicate, isPONumberDuplicate, isInvoiceNumberDuplicate, assignToShipment, createShipment, markShipmentDelivered, pulsePipeline, triggerPulse]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const usePipelineStore = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePipelineStore must be used inside PipelineStoreProvider");
  return ctx;
};
