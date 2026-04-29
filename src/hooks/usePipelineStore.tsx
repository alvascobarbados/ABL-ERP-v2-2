import { createContext, useCallback, useContext, useMemo, useRef, useState, ReactNode } from "react";
import {
  PIPELINES, PipelineId, StageId, MasterProject, SubProject, Shipment, Supplier,
  MASTERS as SEED_MASTERS, SUBS as SEED_SUBS, SHIPMENTS, SUPPLIERS, ShippingMode,
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

// Compute the next stage in flow: within the pipeline, then jump to first stage of next pipeline.
// In Sales we skip "archive" — that stage is picker-only (not part of the forward flow).
export function getNextStage(pipeline: PipelineId, stage: StageId): { pipeline: PipelineId; stage: StageId } | null {
  const p = PIPELINES.find((x) => x.id === pipeline)!;
  const stages = pipeline === "sales"
    ? p.stages.filter((s) => s.id !== "archive")
    : p.stages;
  const idx = stages.findIndex((s) => s.id === stage);
  if (idx >= 0 && idx < stages.length - 1) {
    return { pipeline, stage: stages[idx + 1].id };
  }
  // jump to next pipeline's first stage
  const pi = PIPELINES.findIndex((x) => x.id === pipeline);
  if (pi < PIPELINES.length - 1) {
    const next = PIPELINES[pi + 1];
    return { pipeline: next.id, stage: next.stages[0].id };
  }
  return null;
}

export function getPrevStage(pipeline: PipelineId, stage: StageId): { pipeline: PipelineId; stage: StageId } | null {
  const p = PIPELINES.find((x) => x.id === pipeline)!;
  const stages = pipeline === "sales"
    ? p.stages.filter((s) => s.id !== "archive")
    : p.stages;
  const idx = stages.findIndex((s) => s.id === stage);
  if (idx > 0) return { pipeline, stage: stages[idx - 1].id };
  const pi = PIPELINES.findIndex((x) => x.id === pipeline);
  if (pi > 0) {
    const prev = PIPELINES[pi - 1];
    const prevStages = prev.id === "sales"
      ? prev.stages.filter((s) => s.id !== "archive")
      : prev.stages;
    return { pipeline: prev.id, stage: prevStages[prevStages.length - 1].id };
  }
  return null;
}

// ─────────── Store ───────────
export interface SplitDraftItem {
  itemName: string;
  supplierId: string;
  shippingMode: ShippingMode;
}

interface MoveResult {
  needsSplit?: { masterId: string };
  blocked?: string;
  ok?: boolean;
}

interface PipelineStoreCtx {
  masters: MasterProject[];
  subs: SubProject[];
  shipments: Shipment[];
  suppliers: Supplier[];
  // mutations
  moveCard: (cardId: string, kind: "master" | "sub", target: { pipeline: PipelineId; stage: StageId }) => MoveResult;
  splitMasterToProduction: (masterId: string, items: SplitDraftItem[]) => void;
  // pulse helper for cross-pipeline indicator
  pulsePipeline: PipelineId | null;
  triggerPulse: (id: PipelineId) => void;
}

const Ctx = createContext<PipelineStoreCtx | null>(null);

interface Snapshot {
  masters: MasterProject[];
  subs: SubProject[];
}

export const PipelineStoreProvider = ({ children }: { children: ReactNode }) => {
  const [masters, setMasters] = useState<MasterProject[]>(() => SEED_MASTERS.map((m) => ({ ...m })));
  const [subs, setSubs] = useState<SubProject[]>(() => SEED_SUBS.map((s) => ({ ...s })));
  const [pulsePipeline, setPulsePipeline] = useState<PipelineId | null>(null);
  const pulseTimer = useRef<number | null>(null);

  const triggerPulse = useCallback((id: PipelineId) => {
    setPulsePipeline(id);
    if (pulseTimer.current) window.clearTimeout(pulseTimer.current);
    pulseTimer.current = window.setTimeout(() => setPulsePipeline(null), 900);
  }, []);

  const moveCard = useCallback<PipelineStoreCtx["moveCard"]>((cardId, kind, target) => {
    if (kind === "master") {
      const master = masters.find((m) => m.id === cardId);
      if (!master) return { blocked: "Not found" };
      // Special: Sales/confirming → Operations must split into sub-projects
      if (master.pipeline === "sales" && target.pipeline === "operations") {
        return { needsSplit: { masterId: master.id } };
      }
      setMasters((prev) => prev.map((m) => m.id === cardId ? { ...m, pipeline: target.pipeline, stage: target.stage } : m));
      return { ok: true };
    }
    // sub
    setSubs((prev) => prev.map((s) => s.id === cardId ? { ...s, pipeline: target.pipeline, stage: target.stage } : s));
    return { ok: true };
  }, [masters]);

  const splitMasterToProduction = useCallback((masterId: string, items: SplitDraftItem[]) => {
    const master = masters.find((m) => m.id === masterId);
    if (!master) return;
    // Move master into operations / pre-production
    setMasters((prev) => prev.map((m) => m.id === masterId ? { ...m, pipeline: "operations", stage: "preproduction" } : m));
    // Create subs
    const newSubs: SubProject[] = items.map((it, i) => ({
      id: `sub-${masterId}-${Date.now()}-${i}`,
      masterId,
      itemName: it.itemName || `Item ${i + 1}`,
      summary: it.itemName,
      supplierId: it.supplierId,
      shippingMode: it.shippingMode,
      pipeline: "operations",
      stage: "preproduction",
      deadline: master.deadline,
      deadlineDate: master.deadlineDate,
      value: Math.round(master.value / items.length),
      priority: master.priority,
      orderType: master.orderType,
    }));
    setSubs((prev) => [...prev, ...newSubs]);
  }, [masters]);

  const value = useMemo<PipelineStoreCtx>(() => ({
    masters, subs, shipments: SHIPMENTS, suppliers: SUPPLIERS,
    moveCard, splitMasterToProduction, pulsePipeline, triggerPulse,
  }), [masters, subs, moveCard, splitMasterToProduction, pulsePipeline, triggerPulse]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const usePipelineStore = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePipelineStore must be used inside PipelineStoreProvider");
  return ctx;
};
