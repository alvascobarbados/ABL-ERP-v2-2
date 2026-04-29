import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  PIPELINES, PipelineId, PipelineCard, Shipment, StageId,
  SUPPLIERS, buildCard, distinctProjectNames,
} from "@/data/pipelines";
import { PIPELINE_ACCENT } from "@/lib/brand";
import { usePipelineStore, getStageTitle, validateMove } from "@/hooks/usePipelineStore";
import { StageSection } from "@/components/leads/StageSection";
import { PipelineTabs } from "@/components/leads/PipelineTabs";
import { FilterBar, FilterState } from "@/components/leads/FilterBar";
import { ProjectDetail } from "@/components/leads/ProjectDetail";
import { ShipmentView } from "@/components/leads/ShipmentView";
import { SuppliersView } from "@/components/leads/SuppliersView";
import { StagePicker } from "@/components/leads/StagePicker";
import { SettingsMenu } from "@/components/leads/SettingsMenu";
import { Walkthrough } from "@/components/leads/Walkthrough";
import { ConfirmDialog } from "@/components/leads/ConfirmDialog";
import { ShippingPipelineView, ShippingFilter } from "@/components/leads/ShippingPipelineView";
import { AllPipelineView } from "@/components/leads/AllPipelineView";
import { AssignShipmentSheet } from "@/components/leads/AssignShipmentSheet";
import type { TabId } from "@/components/leads/PipelineTabs";
import { useFriendlyMode } from "@/hooks/useFriendlyMode";
import { Factory } from "lucide-react";

const Index = () => {
  const store = usePipelineStore();
  const { projects, shipments, moveCard, pulsePipeline, triggerPulse } = store;
  const { friendly } = useFriendlyMode();

  const [activeTab, setActiveTab] = useState<TabId>("sales");
  const activePipeline: PipelineId = activeTab === "all" ? "sales" : activeTab;
  const isAll = activeTab === "all";
  const [filters, setFilters] = useState<FilterState>({ customer: null, projectName: null, supplierId: null });

  const [selectedCard, setSelectedCard] = useState<PipelineCard | null>(null);
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);
  const [suppliersOpen, setSuppliersOpen] = useState(false);

  const [pickerCard, setPickerCard] = useState<PipelineCard | null>(null);

  const [confirmLost, setConfirmLost] = useState<{ card: PipelineCard; target: { pipeline: PipelineId; stage: StageId } } | null>(null);

  const [missingFields, setMissingFields] = useState<{ card: PipelineCard; target: { pipeline: PipelineId; stage: StageId }; missing: string[] } | null>(null);

  const [shippingFilter, setShippingFilter] = useState<ShippingFilter>("in_transit");
  const [assignOpen, setAssignOpen] = useState(false);

  // Cards built from live store
  const cards = useMemo<PipelineCard[]>(() => {
    if (isAll) return projects.map(buildCard);
    return projects.filter((p) => p.pipeline === activePipeline).map(buildCard);
  }, [activePipeline, isAll, projects]);

  const counts = useMemo<Record<PipelineId, number>>(() => ({
    sales: projects.filter((p) => p.pipeline === "sales").length,
    operations: projects.filter((p) => p.pipeline === "operations").length,
    shipping: projects.filter((p) => p.pipeline === "shipping" && p.stage !== "shipment_delivered").length,
    finance: projects.filter((p) => p.pipeline === "finance").length,
  }), [projects]);

  const customerOptions = useMemo<string[]>(() => Array.from(new Set(projects.map((p) => p.customer))).sort(), [projects]);
  const projectNameOptions = useMemo<string[]>(() => Array.from(new Set(projects.map((p) => p.projectName))).sort(), [projects]);

  const visible = useMemo(() => {
    return cards.filter((c) => {
      if (filters.customer && c.project.customer !== filters.customer) return false;
      if (filters.projectName && c.project.projectName !== filters.projectName) return false;
      if (filters.supplierId && c.project.supplierId !== filters.supplierId) return false;
      return true;
    });
  }, [cards, filters]);

  const pipeline = PIPELINES.find((p) => p.id === activePipeline)!;

  // ─── Move logic ───
  const performMove = (card: PipelineCard, target: { pipeline: PipelineId; stage: StageId }) => {
    if (friendly && target.stage === "archive" && card.stage !== "archive") {
      setConfirmLost({ card, target });
      return;
    }
    doMove(card, target);
  };

  const doMove = (card: PipelineCard, target: { pipeline: PipelineId; stage: StageId }) => {
    // Validate before moving
    const v = validateMove(card.project, target);
    if (!v.ok) {
      const labels = v.missing.map((m) =>
        m === "detailSummary" ? "detail summary" : m === "supplier" ? "supplier" : "shipping mode",
      );
      setMissingFields({ card, target, missing: labels });
      return;
    }

    const fromPipeline = card.pipeline;
    const fromStage = card.stage;
    const label = `${card.project.customer} · ${card.project.projectName}`;

    const result = moveCard(card.id, target);
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
          moveCard(card.id, { pipeline: fromPipeline, stage: fromStage });
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

  const openShipmentById = (id: string) => {
    setSelectedShipment(shipments.find((s) => s.id === id) ?? null);
    setSelectedCard(null);
  };
  const openProjectById = (id: string) => {
    const proj = projects.find((p) => p.id === id);
    if (!proj) return;
    setActiveTab(proj.pipeline);
    setTimeout(() => {
      setSelectedCard(buildCard(proj));
      setSelectedShipment(null);
    }, 0);
  };

  // Swipe gesture (between tabs)
  const TAB_ORDER: TabId[] = ["all", "sales", "operations", "shipping", "finance"];
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
    const idx = TAB_ORDER.indexOf(activeTab);
    if (dx < 0 && idx < TAB_ORDER.length - 1) setActiveTab(TAB_ORDER[idx + 1]);
    if (dx > 0 && idx > 0) setActiveTab(TAB_ORDER[idx - 1]);
  };

  const accentHex = isAll ? "transparent" : PIPELINE_ACCENT[activePipeline].hex;
  const hasActiveFilter = !!(filters.customer || filters.projectName || filters.supplierId);
  const allTotal = counts.sales + counts.operations + counts.shipping + counts.finance;

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
                key={isAll ? "all" : pipeline.id}
                className="font-display text-4xl sm:text-5xl tracking-tight animate-fade-in"
                style={{ color: "hsl(var(--brand-navy))", letterSpacing: "-0.01em" }}
              >
                {isAll ? "All" : pipeline.title}
              </h1>
              {isAll && (
                <p className="text-sm text-muted-foreground mt-1">
                  {hasActiveFilter
                    ? `Showing ${visible.length} project${visible.length === 1 ? "" : "s"} across all pipelines`
                    : `${allTotal} active project${allTotal === 1 ? "" : "s"} across 4 pipelines`}
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
            <PipelineTabs active={activeTab} onChange={setActiveTab} counts={counts} pulse={pulsePipeline} />
            <div className="flex items-center gap-1">
              {PIPELINES.map((p, i) => {
                const idx = isAll ? -1 : PIPELINES.findIndex((x) => x.id === activePipeline);
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
              projectNames={projectNameOptions}
              suppliers={SUPPLIERS}
            />
          </div>
        </div>
        <div className="h-[3px] w-full transition-colors duration-300" style={{ backgroundColor: accentHex }} />
      </header>

      <main key={activeTab} className="max-w-6xl mx-auto px-5 sm:px-8 py-5 sm:py-7 space-y-4 sm:space-y-5 animate-fade-in">
        {(() => {
          const shippingProjectsFiltered = projects.filter((p) => {
            if (p.pipeline !== "shipping") return false;
            if (filters.supplierId && p.supplierId !== filters.supplierId) return false;
            if (filters.customer && p.customer !== filters.customer) return false;
            if (filters.projectName && p.projectName !== filters.projectName) return false;
            return true;
          });
          const intakeCount = projects.filter((p) => p.pipeline === "shipping" && p.stage === "shipment_required").length;

          if (isAll) {
            return (
              <AllPipelineView
                projects={projects}
                shipments={shipments}
                cards={visible}
                perPipelineCounts={counts}
                hasActiveFilter={hasActiveFilter}
                shippingFilter={shippingFilter}
                onShippingFilterChange={setShippingFilter}
                intakeCount={intakeCount}
                onOpenIntake={() => setAssignOpen(true)}
                onOpenShipment={openShipmentById}
                onOpenCard={setSelectedCard}
                onSwipeForward={onSwipeForward}
                onSwipeBack={onSwipeBack}
                onOpenPicker={onOpenPicker}
                shippingSubs={shippingProjectsFiltered}
              />
            );
          }

          if (activePipeline === "shipping") {
            return (
              <ShippingPipelineView
                subs={shippingProjectsFiltered}
                shipments={shipments}
                filter={shippingFilter}
                onFilterChange={setShippingFilter}
                intakeCount={intakeCount}
                onOpenIntake={() => setAssignOpen(true)}
                onOpenShipment={openShipmentById}
                onOpenCard={setSelectedCard}
                onSwipeForward={onSwipeForward}
                onSwipeBack={onSwipeBack}
                onOpenPicker={onOpenPicker}
              />
            );
          }

          return pipeline.stages.map((stage) => (
            <StageSection
              key={stage.id}
              title={stage.title}
              stage={stage.id}
              cards={visible.filter((c) => c.stage === stage.id)}
              onOpenCard={setSelectedCard}
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
          ));
        })()}


        <p className="text-center text-xs text-muted-foreground pt-4 pb-1">
          Swipe cards → to advance, ← to send back. Long-press or tap ⋮ for more.
        </p>
        <p className="text-center text-[10px] uppercase tracking-[0.3em] pb-2" style={{ color: "hsl(var(--brand-navy))", fontWeight: 500 }}>
          Alvasco
        </p>
      </main>

      <ProjectDetail
        card={selectedCard}
        onClose={() => setSelectedCard(null)}
        onOpenShipment={openShipmentById}
        onAdvance={(c) => {
          const next = nextStage(c);
          if (!next) return;
          setSelectedCard(null);
          performMove(c, next);
        }}
        onOpenPicker={(c) => { setSelectedCard(null); setPickerCard(c); }}
      />
      <ShipmentView
        shipment={selectedShipment}
        onClose={() => setSelectedShipment(null)}
        onOpenProject={openProjectById}
      />
      <SuppliersView
        open={suppliersOpen}
        onClose={() => setSuppliersOpen(false)}
        onOpenProject={(id) => { setSuppliersOpen(false); openProjectById(id); }}
      />

      <StagePicker
        open={!!pickerCard}
        onClose={() => setPickerCard(null)}
        title={pickerCard ? pickerCard.project.projectName : ""}
        subtitle={pickerCard ? pickerCard.project.customer : ""}
        current={pickerCard ? { pipeline: pickerCard.pipeline, stage: pickerCard.stage } : null}
        onPick={handlePickerSelect}
      />

      <ConfirmDialog
        open={!!confirmLost}
        title={confirmLost ? `Move ${confirmLost.card.project.customer} · ${confirmLost.card.project.projectName} to Archive?` : ""}
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

      <ConfirmDialog
        open={!!missingFields}
        title="Missing details"
        description={
          missingFields
            ? `Add the ${missingFields.missing.join(", ")} to "${missingFields.card.project.customer} · ${missingFields.card.project.projectName}" before moving past Confirming. Open the project to fill these in.`
            : ""
        }
        confirmLabel="Open project"
        cancelLabel="Cancel"
        onCancel={() => setMissingFields(null)}
        onConfirm={() => {
          if (!missingFields) return;
          const card = missingFields.card;
          setMissingFields(null);
          setSelectedCard(card);
        }}
      />

      <AssignShipmentSheet
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        intakeSubs={projects.filter((p) => p.pipeline === "shipping" && p.stage === "shipment_required")}
        shipments={shipments}
      />

      <Walkthrough />
    </div>
  );
};

import { getNextStage as nextS, getPrevStage as prevS } from "@/hooks/usePipelineStore";
function nextStage(card: PipelineCard) { return nextS(card.pipeline, card.stage); }
function prevStage(card: PipelineCard) { return prevS(card.pipeline, card.stage); }

export default Index;
