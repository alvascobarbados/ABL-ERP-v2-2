import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  PIPELINES, PipelineId, PipelineCard, MasterProject, Shipment, StageId,
  SUPPLIERS, getMaster,
} from "@/data/pipelines";
import { PIPELINE_ACCENT } from "@/lib/brand";
import { usePipelineStore, getStageTitle, SplitDraftItem } from "@/hooks/usePipelineStore";
import { StageSection } from "@/components/leads/StageSection";
import { PipelineTabs } from "@/components/leads/PipelineTabs";
import { FilterBar, FilterState } from "@/components/leads/FilterBar";
import { ProjectDetail } from "@/components/leads/ProjectDetail";
import { MasterProjectView } from "@/components/leads/MasterProjectView";
import { ShipmentView } from "@/components/leads/ShipmentView";
import { SuppliersView } from "@/components/leads/SuppliersView";
import { StagePicker } from "@/components/leads/StagePicker";
import { SplitToProductionSheet } from "@/components/leads/SplitToProductionSheet";
import { SettingsMenu } from "@/components/leads/SettingsMenu";
import { Walkthrough } from "@/components/leads/Walkthrough";
import { WelcomeTip } from "@/components/leads/WelcomeTip";
import { ConfirmDialog } from "@/components/leads/ConfirmDialog";
import { ShippingPipelineView, ShippingFilter } from "@/components/leads/ShippingPipelineView";
import { AssignShipmentSheet } from "@/components/leads/AssignShipmentSheet";
import { useFriendlyMode, FRIENDLY_PIPELINE_SUBTITLES } from "@/hooks/useFriendlyMode";
import { Factory } from "lucide-react";
import { cn } from "@/lib/utils";

const Index = () => {
  const store = usePipelineStore();
  const { masters, subs, shipments, moveCard, splitMasterToProduction, pulsePipeline, triggerPulse } = store;
  const { friendly } = useFriendlyMode();

  const [activePipeline, setActivePipeline] = useState<PipelineId>("sales");
  const [filters, setFilters] = useState<FilterState>({ shippingMode: null, orderType: null, priority: null, customer: null, supplierId: null });

  const [selectedCard, setSelectedCard] = useState<PipelineCard | null>(null);
  const [selectedMaster, setSelectedMaster] = useState<MasterProject | null>(null);
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);
  const [suppliersOpen, setSuppliersOpen] = useState(false);

  // Stage Picker state
  const [pickerCard, setPickerCard] = useState<PipelineCard | null>(null);

  // Split sheet state
  const [splitMaster, setSplitMaster] = useState<MasterProject | null>(null);

  // Pending "Lost" confirmation
  const [confirmLost, setConfirmLost] = useState<{ card: PipelineCard; target: { pipeline: PipelineId; stage: StageId } } | null>(null);

  // Shipping pipeline state
  const [shippingFilter, setShippingFilter] = useState<ShippingFilter>("in_transit");
  const [assignOpen, setAssignOpen] = useState(false);

  // Build cards from live store
  const cards = useMemo<PipelineCard[]>(() => {
    if (activePipeline === "sales") {
      return masters.filter((m) => m.pipeline === "sales").map((master) => ({
        kind: "master", id: master.id, master,
        pipeline: master.pipeline, stage: master.stage,
        deadline: master.deadline, deadlineDate: master.deadlineDate,
        shippingMode: master.shippingMode, orderType: master.orderType, priority: master.priority,
      }));
    }
    return subs.filter((s) => s.pipeline === activePipeline).map((sub) => {
      const master = masters.find((m) => m.id === sub.masterId)!;
      return {
        kind: "sub", id: sub.id, master, sub,
        supplier: SUPPLIERS.find((x) => x.id === sub.supplierId),
        shipment: sub.shipmentId ? shipments.find((x) => x.id === sub.shipmentId) : undefined,
        pipeline: sub.pipeline, stage: sub.stage,
        deadline: sub.deadline, deadlineDate: sub.deadlineDate,
        shippingMode: sub.shippingMode, orderType: sub.orderType, priority: sub.priority,
      };
    });
  }, [activePipeline, masters, subs]);

  const counts = useMemo<Record<PipelineId, number>>(() => ({
    sales: masters.filter((m) => m.pipeline === "sales").length,
    operations: subs.filter((s) => s.pipeline === "operations").length,
    shipping: subs.filter((s) => s.pipeline === "shipping" && s.stage !== "shipment_delivered").length,
    finance: subs.filter((s) => s.pipeline === "finance").length,
  }), [masters, subs]);

  const customerOptions = useMemo(() => Array.from(new Set(masters.map((m) => m.customer))).sort(), [masters]);

  const visible = useMemo(() => {
    return cards.filter((c) => {
      if (filters.shippingMode && c.shippingMode !== filters.shippingMode) return false;
      if (filters.orderType && c.orderType !== filters.orderType) return false;
      if (filters.priority && c.priority !== filters.priority) return false;
      if (filters.customer && c.master.customer !== filters.customer) return false;
      if (filters.supplierId) {
        if (c.kind === "sub") {
          if (c.sub?.supplierId !== filters.supplierId) return false;
        } else {
          const masterSubs = subs.filter((s) => s.masterId === c.master.id);
          if (!masterSubs.some((s) => s.supplierId === filters.supplierId)) return false;
        }
      }
      return true;
    });
  }, [cards, filters, subs]);

  const pipeline = PIPELINES.find((p) => p.id === activePipeline)!;

  // ─── Move logic ───
  const performMove = (card: PipelineCard, target: { pipeline: PipelineId; stage: StageId }) => {
    // Friendly Mode safety net for "Archive" (closed-but-not-deleted)
    if (friendly && target.stage === "archive" && card.stage !== "archive") {
      setConfirmLost({ card, target });
      return;
    }
    doMove(card, target);
  };

  const doMove = (card: PipelineCard, target: { pipeline: PipelineId; stage: StageId }) => {
    const fromPipeline = card.pipeline;
    const fromStage = card.stage;
    const label = card.kind === "master" ? card.master.projectName : `${card.master.customer} · ${card.sub!.itemName}`;

    const result = moveCard(card.id, card.kind, target);

    if (result.needsSplit) {
      const m = masters.find((x) => x.id === result.needsSplit!.masterId) ?? null;
      setSplitMaster(m);
      setPickerCard(null);
      return;
    }
    if (!result.ok) return;

    if (target.pipeline !== fromPipeline) triggerPulse(target.pipeline);

    const successFn = friendly ? toast.success : toast;
    const message = friendly
      ? `Done — ${label} moved to ${getStageTitle(target.pipeline, target.stage)}`
      : `${label} moved to ${getStageTitle(target.pipeline, target.stage)}`;

    successFn(message, {
      description: `From ${getStageTitle(fromPipeline, fromStage)}. Tap Undo to reverse.`,
      duration: friendly ? 7000 : 5000,
      action: {
        label: "Undo",
        onClick: () => {
          moveCard(card.id, card.kind, { pipeline: fromPipeline, stage: fromStage });
          toast(`Move undone`, { duration: 2500 });
        },
      },
    });
  };

  const onSwipeForward = (card: PipelineCard) => {
    const next = nextStage(card);
    if (!next) return;
    performMove(card, next);
  };
  const onSwipeBack = (card: PipelineCard) => {
    const prev = prevStage(card);
    if (!prev) return;
    performMove(card, prev);
  };
  const onOpenPicker = (card: PipelineCard) => setPickerCard(card);

  const handlePickerSelect = (target: { pipeline: PipelineId; stage: StageId }) => {
    if (!pickerCard) return;
    const card = pickerCard;
    setPickerCard(null);
    performMove(card, target);
  };

  const handleSplitConfirm = (items: SplitDraftItem[]) => {
    if (!splitMaster) return;
    const m = splitMaster;
    splitMasterToProduction(m.id, items);
    triggerPulse("operations");
    setSplitMaster(null);
    toast(`${m.projectName} split into ${items.length} sub-project${items.length > 1 ? "s" : ""}, sent to Operations`, {
      duration: 5000,
    });
  };

  // Cross-view helpers (unchanged)
  const openMasterById = (id: string) => {
    const m = masters.find((x) => x.id === id) ?? getMaster(id) ?? null;
    setSelectedMaster(m);
    setSelectedCard(null);
    setSelectedShipment(null);
  };
  const openShipmentById = (id: string) => {
    setSelectedShipment(shipments.find((s) => s.id === id) ?? null);
    setSelectedCard(null);
    setSelectedMaster(null);
  };
  const openSubById = (id: string) => {
    const sub = subs.find((s) => s.id === id);
    if (!sub) return;
    setActivePipeline(sub.pipeline);
    // We can't build the card in the alternate pipeline synchronously here, but Index will rebuild on render.
    // Defer card-open via microtask
    setTimeout(() => {
      const list = activePipelineCards(sub.pipeline);
      const card = list.find((c) => c.id === sub.id) ?? null;
      if (card) {
        setSelectedCard(card);
        setSelectedMaster(null);
        setSelectedShipment(null);
      }
    }, 0);
  };
  const activePipelineCards = (pid: PipelineId): PipelineCard[] => {
    if (pid === "sales") {
      return masters.filter((m) => m.pipeline === "sales").map((master) => ({
        kind: "master", id: master.id, master,
        pipeline: master.pipeline, stage: master.stage,
        deadline: master.deadline, deadlineDate: master.deadlineDate,
        shippingMode: master.shippingMode, orderType: master.orderType, priority: master.priority,
      }));
    }
    return subs.filter((s) => s.pipeline === pid).map((sub) => {
      const master = masters.find((m) => m.id === sub.masterId)!;
      return {
        kind: "sub", id: sub.id, master, sub,
        supplier: SUPPLIERS.find((x) => x.id === sub.supplierId),
        shipment: sub.shipmentId ? shipments.find((x) => x.id === sub.shipmentId) : undefined,
        pipeline: sub.pipeline, stage: sub.stage,
        deadline: sub.deadline, deadlineDate: sub.deadlineDate,
        shippingMode: sub.shippingMode, orderType: sub.orderType, priority: sub.priority,
      };
    });
  };

  // Swipe gesture (between pipelines)
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.current.x;
    const dy = t.clientY - touchStart.current.y;
    touchStart.current = null;
    if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx)) return;
    const idx = PIPELINES.findIndex((p) => p.id === activePipeline);
    if (dx < 0 && idx < PIPELINES.length - 1) setActivePipeline(PIPELINES[idx + 1].id);
    if (dx > 0 && idx > 0) setActivePipeline(PIPELINES[idx - 1].id);
  };

  const accentHex = PIPELINE_ACCENT[activePipeline].hex;

  return (
    <div className="min-h-screen bg-background" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <header className="sticky top-0 z-20 bg-background/85 backdrop-blur-md border-b border-border/70">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 pt-5 pb-3">
          <div className="flex items-end justify-between mb-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground font-medium mb-1">
                Alvasco · Operations
              </p>
              <h1
                key={pipeline.id}
                className="font-display text-4xl sm:text-5xl tracking-tight animate-fade-in"
                style={{ color: "hsl(var(--brand-navy))", letterSpacing: "-0.01em" }}
              >
                {pipeline.title}
              </h1>
              {friendly && (
                <p className="text-sm text-muted-foreground mt-1">
                  {FRIENDLY_PIPELINE_SUBTITLES[activePipeline]}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSuppliersOpen(true)}
                className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border bg-card/60 hover:bg-card transition-colors"
                style={{ borderColor: "hsl(var(--brand-navy) / 0.25)", color: "hsl(var(--brand-navy))" }}
                aria-label="Open suppliers"
              >
                <Factory className="h-3.5 w-3.5" /> Suppliers
              </button>
              <SettingsMenu />
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">In pipeline</p>
                <p className="text-2xl font-semibold tabular" style={{ color: "hsl(var(--brand-navy))" }}>{visible.length}</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <PipelineTabs active={activePipeline} onChange={setActivePipeline} counts={counts} pulse={pulsePipeline} />
            <div className="flex items-center gap-1">
              {PIPELINES.map((p, i) => {
                const idx = PIPELINES.findIndex((x) => x.id === activePipeline);
                return (
                  <span
                    key={p.id}
                    className="h-1 rounded-full transition-all duration-300"
                    style={{
                      width: i === idx ? "1.5rem" : "0.375rem",
                      backgroundColor: i === idx ? PIPELINE_ACCENT[p.id].hex : "hsl(var(--muted-foreground) / 0.3)",
                    }}
                  />
                );
              })}
            </div>
          </div>

          <div className="mt-3">
            <FilterBar
              value={filters}
              onChange={setFilters}
              customers={customerOptions}
              suppliers={SUPPLIERS}
            />
          </div>
        </div>
        {/* Per-pipeline accent stripe */}
        <div className="h-[3px] w-full transition-colors duration-300" style={{ backgroundColor: accentHex }} />
      </header>

      <main key={activePipeline} className="max-w-6xl mx-auto px-5 sm:px-8 py-5 sm:py-7 space-y-4 sm:space-y-5 animate-fade-in">
        <WelcomeTip
          id={`pipeline-${activePipeline}`}
          text={
            activePipeline === "sales"
              ? "Welcome to Sales. New customer enquiries live here until they're confirmed. Tap any card to see details, or use Move Forward to advance it."
              : activePipeline === "operations"
                ? "Operations covers Pre-Production and In Production. When the factory finishes, items move to Shipping for shipment assignment."
                : activePipeline === "shipping"
                  ? "Shipping is organised by shipment, not by stage. Air and Ocean groups hold every active shipment — tap a code to see what's inside, or open it to mark delivered."
                  : "Finance starts with Invoice Required (goods delivered, ready to invoice), then Invoiced, then Paid."
          }
        />

        {activePipeline === "shipping" ? (
          <ShippingPipelineView
            subs={subs.filter((s) => {
              if (s.pipeline !== "shipping") return false;
              if (filters.shippingMode && s.shippingMode !== filters.shippingMode) return false;
              if (filters.priority && s.priority !== filters.priority) return false;
              if (filters.orderType && s.orderType !== filters.orderType) return false;
              if (filters.supplierId && s.supplierId !== filters.supplierId) return false;
              if (filters.customer) {
                const m = masters.find((x) => x.id === s.masterId);
                if (m?.customer !== filters.customer) return false;
              }
              return true;
            })}
            shipments={shipments}
            filter={shippingFilter}
            onFilterChange={setShippingFilter}
            intakeCount={subs.filter((s) => s.pipeline === "shipping" && s.stage === "shipment_required").length}
            onOpenIntake={() => setAssignOpen(true)}
            onOpenShipment={openShipmentById}
            onOpenCard={setSelectedCard}
            onOpenMaster={openMasterById}
            onSwipeForward={onSwipeForward}
            onSwipeBack={onSwipeBack}
            onOpenPicker={onOpenPicker}
          />
        ) : (
          pipeline.stages.map((stage) => (
            <StageSection
              key={stage.id}
              title={stage.title}
              stage={stage.id}
              cards={visible.filter((c) => c.stage === stage.id)}
              onOpenCard={setSelectedCard}
              onOpenMaster={openMasterById}
              onOpenShipment={openShipmentById}
              onSwipeForward={onSwipeForward}
              onSwipeBack={onSwipeBack}
              onOpenPicker={onOpenPicker}
              emptyHint={
                stage.id === "proposal" ? "No projects here yet. New leads will appear in Proposal."
                : stage.id === "archive" ? "Nothing archived. Cold or lost projects will land here."
                : stage.id === "invoice_required" ? "No projects awaiting an invoice."
                : undefined
              }
            />
          ))
        )}


        <p className="text-center text-xs text-muted-foreground pt-4 pb-1">
          {friendly
            ? "Tap Move Forward / Back on any card. Power users can swipe."
            : "Swipe cards → to advance, ← to send back. Long-press for any stage."}
        </p>
        <p className="text-center text-[10px] uppercase tracking-[0.3em] pb-2" style={{ color: "hsl(var(--brand-navy))", fontWeight: 500 }}>
          Alvasco
        </p>
      </main>

      <ProjectDetail
        card={selectedCard}
        onClose={() => setSelectedCard(null)}
        onOpenMaster={openMasterById}
        onOpenShipment={openShipmentById}
      />
      <MasterProjectView
        master={selectedMaster}
        onClose={() => setSelectedMaster(null)}
        onOpenSub={openSubById}
        onOpenShipment={openShipmentById}
      />
      <ShipmentView
        shipment={selectedShipment}
        onClose={() => setSelectedShipment(null)}
        onOpenSub={openSubById}
        onOpenMaster={openMasterById}
      />
      <SuppliersView
        open={suppliersOpen}
        onClose={() => setSuppliersOpen(false)}
        onOpenSub={(id) => { setSuppliersOpen(false); openSubById(id); }}
        onOpenMaster={(id) => { setSuppliersOpen(false); openMasterById(id); }}
      />

      <StagePicker
        open={!!pickerCard}
        onClose={() => setPickerCard(null)}
        title={pickerCard ? (pickerCard.kind === "master" ? pickerCard.master.projectName : pickerCard.sub!.itemName) : ""}
        subtitle={pickerCard ? `${pickerCard.master.customer}` : ""}
        current={pickerCard ? { pipeline: pickerCard.pipeline, stage: pickerCard.stage } : null}
        onPick={handlePickerSelect}
      />

      <SplitToProductionSheet
        master={splitMaster}
        suppliers={SUPPLIERS}
        open={!!splitMaster}
        onClose={() => setSplitMaster(null)}
        onConfirm={handleSplitConfirm}
      />

      <ConfirmDialog
        open={!!confirmLost}
        title={confirmLost ? `Move ${confirmLost.card.kind === "master" ? confirmLost.card.master.projectName : confirmLost.card.master.customer} to Archive?` : ""}
        description="Archive holds closed-but-not-deleted projects (cold leads, lost deals, anything paused). You can move it back later if it comes back to life."
        confirmLabel="Yes, archive it"
        cancelLabel="Cancel"
        destructive
        onCancel={() => setConfirmLost(null)}
        onConfirm={() => {
          if (!confirmLost) return;
          const { card, target } = confirmLost;
          setConfirmLost(null);
          doMove(card, target);
        }}
      />

      <Walkthrough />
    </div>
  );
};

// helpers using shared logic
import { getNextStage as nextS, getPrevStage as prevS } from "@/hooks/usePipelineStore";
function nextStage(card: PipelineCard) { return nextS(card.pipeline, card.stage); }
function prevStage(card: PipelineCard) { return prevS(card.pipeline, card.stage); }

export default Index;
