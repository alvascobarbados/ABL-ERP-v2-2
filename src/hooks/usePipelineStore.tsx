import { createContext, useCallback, useContext, useMemo, useRef, useState, ReactNode } from "react";
import {
  PIPELINES, PipelineId, StageId, MasterProject, SubProject, Shipment, Supplier,
  MASTERS as SEED_MASTERS, SUBS as SEED_SUBS, SHIPMENTS as SEED_SHIPMENTS, SUPPLIERS, ShippingMode,
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

// Forward flow stages — Sales skips archive; Shipping treats shipment_required as the only forward target from Operations,
// and only shipment_assigned advances forward to Finance.
function forwardStages(pipeline: PipelineId): StageId[] {
  const p = PIPELINES.find((x) => x.id === pipeline)!;
  if (pipeline === "sales") return p.stages.filter((s) => s.id !== "archive").map((s) => s.id);
  if (pipeline === "shipping") return ["shipment_assigned"]; // single forward step lives in Shipping
  return p.stages.map((s) => s.id);
}

export function getNextStage(pipeline: PipelineId, stage: StageId): { pipeline: PipelineId; stage: StageId } | null {
  // Within Shipping, "Mark Delivered" is the only forward action — and it's manual via the Shipment view.
  // For card-level swipe, advancing from shipment_assigned sends to Finance (the per-shipment bulk path is preferred).
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
  // jump to next pipeline's first stage
  const pi = PIPELINES.findIndex((x) => x.id === pipeline);
  if (pi < PIPELINES.length - 1) {
    const next = PIPELINES[pi + 1];
    // Operations → Shipping enters at shipment_required (intake)
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
    if (stage === "shipment_delivered") return { pipeline: "shipping", stage: "shipment_assigned" };
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

export interface NewShipmentInput {
  mode: ShippingMode;
  code: string;
  etd: Date;
  eta: Date;
  supplierId: string;
}

interface PipelineStoreCtx {
  masters: MasterProject[];
  subs: SubProject[];
  shipments: Shipment[];
  suppliers: Supplier[];
  // mutations
  moveCard: (cardId: string, kind: "master" | "sub", target: { pipeline: PipelineId; stage: StageId }) => MoveResult;
  splitMasterToProduction: (masterId: string, items: SplitDraftItem[]) => void;
  // shipping ops
  assignSubToShipment: (subId: string, shipmentId: string) => void;
  createShipment: (input: NewShipmentInput) => Shipment;
  markShipmentDelivered: (shipmentId: string) => { count: number };
  // pulse helper for cross-pipeline indicator
  pulsePipeline: PipelineId | null;
  triggerPulse: (id: PipelineId) => void;
}

const Ctx = createContext<PipelineStoreCtx | null>(null);

export const PipelineStoreProvider = ({ children }: { children: ReactNode }) => {
  const [masters, setMasters] = useState<MasterProject[]>(() => SEED_MASTERS.map((m) => ({ ...m })));
  const [subs, setSubs] = useState<SubProject[]>(() => SEED_SUBS.map((s) => ({ ...s })));
  const [shipments, setShipments] = useState<Shipment[]>(() => SEED_SHIPMENTS.map((s) => ({ ...s })));
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
      if (master.pipeline === "sales" && target.pipeline === "operations") {
        return { needsSplit: { masterId: master.id } };
      }
      setMasters((prev) => prev.map((m) => m.id === cardId ? { ...m, pipeline: target.pipeline, stage: target.stage } : m));
      return { ok: true };
    }
    setSubs((prev) => prev.map((s) => {
      if (s.id !== cardId) return s;
      // When entering shipment_required, drop any prior shipmentId.
      if (target.pipeline === "shipping" && target.stage === "shipment_required") {
        return { ...s, pipeline: target.pipeline, stage: target.stage, shipmentId: undefined };
      }
      return { ...s, pipeline: target.pipeline, stage: target.stage };
    }));
    return { ok: true };
  }, [masters]);

  const splitMasterToProduction = useCallback((masterId: string, items: SplitDraftItem[]) => {
    const master = masters.find((m) => m.id === masterId);
    if (!master) return;
    setMasters((prev) => prev.map((m) => m.id === masterId ? { ...m, pipeline: "operations", stage: "preproduction" } : m));
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

  const assignSubToShipment = useCallback((subId: string, shipmentId: string) => {
    const ship = shipments.find((s) => s.id === shipmentId);
    if (!ship) return;
    setSubs((prev) => prev.map((s) => s.id === subId
      ? { ...s, shipmentId, pipeline: "shipping", stage: "shipment_assigned", shippingMode: ship.mode }
      : s));
  }, [shipments]);

  const createShipment = useCallback((input: NewShipmentInput): Shipment => {
    const newShip: Shipment = {
      id: `ship-${Date.now()}`,
      code: input.code,
      mode: input.mode,
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
    setSubs((prev) => prev.map((s) => {
      if (s.shipmentId === shipmentId && s.pipeline === "shipping") {
        count += 1;
        return { ...s, pipeline: "finance", stage: "invoice_required" };
      }
      return s;
    }));
    setShipments((prev) => prev.map((s) => s.id === shipmentId ? { ...s, status: "Delivered" } : s));
    return { count };
  }, []);

  const value = useMemo<PipelineStoreCtx>(() => ({
    masters, subs, shipments, suppliers: SUPPLIERS,
    moveCard, splitMasterToProduction,
    assignSubToShipment, createShipment, markShipmentDelivered,
    pulsePipeline, triggerPulse,
  }), [masters, subs, shipments, moveCard, splitMasterToProduction, assignSubToShipment, createShipment, markShipmentDelivered, pulsePipeline, triggerPulse]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const usePipelineStore = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePipelineStore must be used inside PipelineStoreProvider");
  return ctx;
};
