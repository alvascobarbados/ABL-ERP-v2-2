import { useEffect, useMemo, useRef, useState } from "react";
import { Menu } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  PIPELINES, PipelineId, PipelineCard, Shipment, StageId,
  SUPPLIERS, buildCard, Project,
} from "@/data/pipelines";
import { PIPELINE_ACCENT } from "@/lib/brand";
import { usePipelineStore, getStageTitle, validateMove } from "@/hooks/usePipelineStore";
import { StageSection } from "@/components/leads/StageSection";
import { PipelineTabs } from "@/components/leads/PipelineTabs";
import { FilterState, EMPTY_FILTER, filterCount } from "@/components/leads/FilterBar";
import { ProjectDetail } from "@/components/leads/ProjectDetail";
import { ShipmentView } from "@/components/leads/ShipmentView";
import { SuppliersView } from "@/components/leads/SuppliersView";
import { CustomersView } from "@/components/leads/CustomersView";
import { ShipmentsView } from "@/components/leads/ShipmentsView";
import { TrashView } from "@/components/leads/TrashView";
import { HamburgerDrawer } from "@/components/leads/HamburgerDrawer";
import { TopControls } from "@/components/leads/TopControls";
import { FilterSheet } from "@/components/leads/FilterSheet";
import { SortSheet, SortState, DEFAULT_DIR, SortField } from "@/components/leads/SortSheet";
import { StagePicker } from "@/components/leads/StagePicker";
import { SettingsMenu } from "@/components/leads/SettingsMenu";
import { Walkthrough } from "@/components/leads/Walkthrough";
import { Wordmark } from "@/components/leads/Wordmark";
import { ConfirmDialog } from "@/components/leads/ConfirmDialog";
import { ShippingPipelineView, ShippingFilter } from "@/components/leads/ShippingPipelineView";
import { AllPipelineView } from "@/components/leads/AllPipelineView";
import { AssignShipmentSheet } from "@/components/leads/AssignShipmentSheet";
import type { TabId } from "@/components/leads/PipelineTabs";
import { JiggleProvider } from "@/hooks/useJiggle";
import { EditModeProvider } from "@/hooks/useEditMode";
import { haptics } from "@/lib/haptics";
// ─── Filter persistence per-tab ───
const FILTER_STORAGE = "alvasco.filters.v2";
const DEFAULT_FILTERS: Record<TabId, FilterState> = {
  all: EMPTY_FILTER, sales: EMPTY_FILTER, operations: EMPTY_FILTER,
  shipping: EMPTY_FILTER, finance: EMPTY_FILTER,
};
function loadFilters(): Record<TabId, FilterState> {
  try {
    const raw = localStorage.getItem(FILTER_STORAGE);
    if (!raw) return DEFAULT_FILTERS;
    const parsed = JSON.parse(raw);
    // Merge each tab to ensure new fields default cleanly
    const out = { ...DEFAULT_FILTERS } as Record<TabId, FilterState>;
    for (const k of Object.keys(out) as TabId[]) {
      out[k] = { ...EMPTY_FILTER, ...(parsed?.[k] ?? {}) };
    }
    return out;
  } catch {
    return DEFAULT_FILTERS;
  }
}

// ─── Sort persistence per-tab ───
const SORT_STORAGE = "alvasco.sort.v1";
const DEFAULT_SORTS: Record<TabId, SortState> = {
  all: { field: "deadline", dir: "asc" },
  sales: { field: "deadline", dir: "asc" },
  operations: { field: "deadline", dir: "asc" },
  shipping: { field: "deadline", dir: "asc" },
  finance: { field: "deadline", dir: "asc" },
};

function loadSorts(): Record<TabId, SortState> {
  try {
    const raw = localStorage.getItem(SORT_STORAGE);
    if (!raw) return DEFAULT_SORTS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SORTS, ...parsed };
  } catch {
    return DEFAULT_SORTS;
  }
}

const TODAY = new Date(2026, 4, 8);
const DAY_MS = 86400000;
const MODE_ORDER: Record<string, number> = { Air: 0, Ocean: 1, Local: 2 };

function daysToDeadline(d: Date) {
  return Math.ceil((d.getTime() - TODAY.getTime()) / DAY_MS);
}

function compareCards(
  a: PipelineCard, b: PipelineCard, sort: SortState,
  idIndex: Map<string, number>, supplierName: (id?: string) => string,
): number {
  const dir = sort.dir === "asc" ? 1 : -1;
  const nullLast = (av: string, bv: string) => {
    if (av && !bv) return -1;
    if (!av && bv) return 1;
    return 0;
  };
  switch (sort.field) {
    case "deadline":
      return dir * (a.deadlineDate.getTime() - b.deadlineDate.getTime());
    case "daysToDeadline":
      return dir * (daysToDeadline(a.deadlineDate) - daysToDeadline(b.deadlineDate));
    case "created": {
      const at = a.project.createdAt?.getTime() ?? 0;
      const bt = b.project.createdAt?.getTime() ?? 0;
      if (at !== bt) return dir * (at - bt);
      return dir * ((idIndex.get(a.id) ?? 0) - (idIndex.get(b.id) ?? 0));
    }
    case "updated": {
      const at = a.project.updatedAt?.getTime() ?? a.project.createdAt?.getTime() ?? 0;
      const bt = b.project.updatedAt?.getTime() ?? b.project.createdAt?.getTime() ?? 0;
      return dir * (at - bt);
    }
    case "customer":
      return dir * a.project.customer.localeCompare(b.project.customer);
    case "projectName":
      return dir * a.project.projectName.localeCompare(b.project.projectName);
    case "supplier": {
      const av = supplierName(a.project.supplierId) || a.project.supplierLabel || "";
      const bv = supplierName(b.project.supplierId) || b.project.supplierLabel || "";
      const n = nullLast(av, bv); if (n) return n;
      return dir * av.localeCompare(bv);
    }
    case "shippingMode": {
      const av = a.project.shippingMode ?? "";
      const bv = b.project.shippingMode ?? "";
      const n = nullLast(av, bv); if (n) return n;
      return dir * ((MODE_ORDER[av] ?? 99) - (MODE_ORDER[bv] ?? 99));
    }
    case "salesRep": {
      const av = a.project.pointPerson ?? "";
      const bv = b.project.pointPerson ?? "";
      return dir * av.localeCompare(bv);
    }
    case "quote": {
      const av = a.project.quoteNumber ?? "";
      const bv = b.project.quoteNumber ?? "";
      const n = nullLast(av, bv); if (n) return n;
      return dir * av.localeCompare(bv, undefined, { numeric: true });
    }
  }
}

function projectMatchesSearch(p: Project, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  const lineItemText = (p.lineItems ?? []).map((li) => li.description).join(" ");
  const fields = [
    p.customer, p.projectName, p.detailSummary ?? "", p.contactPerson ?? "",
    p.pointPerson ?? "",
    p.quoteNumber ?? "", p.poNumber ?? "", p.invoiceNumber ?? "", p.trackingRef ?? "",
    lineItemText,
  ];
  return fields.some((f) => f.toLowerCase().includes(needle));
}

function projectHasMissingData(p: Project): boolean {
  const stageRank: Record<StageId, number> = {
    proposal: 0, quote: 1, confirming: 2, archive: 0,
    preproduction: 3, in_production: 4,
    shipment_required: 5, shipment_assigned: 6,
    invoice_required: 7, invoiced: 8, paid: 9,
  };
  const r = stageRank[p.stage] ?? 0;
  if (r >= 1 && !p.quoteNumber) return true;
  if (r >= 2 && !p.supplierId) return true;
  if (r >= 2 && !p.shippingMode) return true;
  if (r >= 2 && !p.detailSummary?.trim()) return true;
  if (r >= 3 && !p.poNumber) return true;
  if (r >= 7 && !p.invoiceNumber) return true;
  return false;
}

function cardMatchesFilter(c: PipelineCard, f: FilterState): boolean {
  const p = c.project;
  if (f.customers.length && !f.customers.includes(p.customer)) return false;
  if (f.projectNames.length && !f.projectNames.includes(p.projectName)) return false;
  if (f.supplierIds.length) {
    const wantUnassigned = f.supplierIds.includes("__unassigned");
    const matchSup = p.supplierId && f.supplierIds.includes(p.supplierId);
    const isUnassigned = !p.supplierId;
    if (!matchSup && !(wantUnassigned && isUnassigned)) return false;
  }
  if (f.shippingModes.length) {
    const mode = p.shippingMode ?? "Unassigned";
    if (!f.shippingModes.includes(mode as never)) return false;
  }
  if (f.salesReps.length && !f.salesReps.includes(p.pointPerson)) return false;
  if (f.stages.length && !f.stages.includes(p.stage)) return false;
  if (f.urgency) {
    const days = daysToDeadline(c.deadlineDate);
    if (f.urgency === "overdue" && days >= 0) return false;
    if (f.urgency === "this_week" && (days < 0 || days > 7)) return false;
    if (f.urgency === "this_month" && (days < 0 || days > 30)) return false;
    if (f.urgency === "no_deadline") return false;
  }
  if (f.missingOnly && !projectHasMissingData(p)) return false;
  if (f.flagged === true && !p.flagged) return false;
  if (f.flagged === false && p.flagged) return false;
  return true;
}

const Index = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const store = usePipelineStore();
  const { projects, shipments, moveCard, pulsePipeline, triggerPulse } = store;

  const [activeTab, setActiveTab] = useState<TabId>("sales");
  const activePipeline: PipelineId = activeTab === "all" ? "sales" : activeTab;
  const isAll = activeTab === "all";

  // Per-tab filter persistence
  const [filtersByTab, setFiltersByTab] = useState<Record<TabId, FilterState>>(loadFilters);
  const filters = filtersByTab[activeTab];
  const setFilters = (next: FilterState) => {
    const updated = { ...filtersByTab, [activeTab]: next };
    setFiltersByTab(updated);
    try { localStorage.setItem(FILTER_STORAGE, JSON.stringify(updated)); } catch { /* noop */ }
  };

  const [selectedCard, setSelectedCard] = useState<PipelineCard | null>(null);
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);

  const [hamburgerOpen, setHamburgerOpen] = useState(false);
  const [suppliersOpen, setSuppliersOpen] = useState(false);
  const [customersOpen, setCustomersOpen] = useState(false);
  const [shipmentsListOpen, setShipmentsListOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [sortSheetOpen, setSortSheetOpen] = useState(false);

  const [search, setSearch] = useState("");
  const [searchScopeAll, setSearchScopeAll] = useState(false);

  const [pickerCard, setPickerCard] = useState<PipelineCard | null>(null);
  const [confirmLost, setConfirmLost] = useState<{ card: PipelineCard; target: { pipeline: PipelineId; stage: StageId } } | null>(null);
  const [missingFields, setMissingFields] = useState<{ card: PipelineCard; target: { pipeline: PipelineId; stage: StageId }; missing: string[] } | null>(null);
  const [shippingFilter, setShippingFilter] = useState<ShippingFilter>("in_transit");
  const [assignOpen, setAssignOpen] = useState(false);

  // Sort state, persisted per tab
  const [sorts, setSorts] = useState<Record<TabId, SortState>>(loadSorts);
  const sort = sorts[activeTab];
  const setSort = (s: SortState) => {
    const next = { ...sorts, [activeTab]: s };
    setSorts(next);
    try { localStorage.setItem(SORT_STORAGE, JSON.stringify(next)); } catch { /* noop */ }
  };

  // Reset search when switching tabs
  useEffect(() => { setSearch(""); setSearchScopeAll(false); }, [activeTab]);

  // Open project detail when arriving from /spreadsheet?project=prj-X.
  useEffect(() => {
    const id = searchParams.get("project");
    if (!id) return;
    const proj = projects.find((p) => p.id === id);
    if (proj) {
      setActiveTab(proj.pipeline);
      setTimeout(() => { setSelectedCard(buildCard(proj)); setSelectedShipment(null); }, 0);
    }
    const next = new URLSearchParams(searchParams);
    next.delete("project");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Index for stable secondary ordering
  const idIndex = useMemo(() => {
    const m = new Map<string, number>();
    projects.forEach((p, i) => m.set(p.id, i));
    return m;
  }, [projects]);

  const supplierName = useMemo(() => {
    const map = new Map(SUPPLIERS.map((s) => [s.id, s.name]));
    return (id?: string) => (id ? map.get(id) ?? "" : "");
  }, []);

  // Build cards list (scope by tab)
  const baseCards = useMemo<PipelineCard[]>(() => {
    if (isAll) return projects.map(buildCard);
    return projects.filter((p) => p.pipeline === activePipeline).map(buildCard);
  }, [activePipeline, isAll, projects]);

  const counts = useMemo<Record<PipelineId, number>>(() => ({
    sales: projects.filter((p) => p.pipeline === "sales").length,
    operations: projects.filter((p) => p.pipeline === "operations").length,
    shipping: projects.filter((p) => p.pipeline === "shipping").length,
    finance: projects.filter((p) => p.pipeline === "finance").length,
  }), [projects]);

  const customerOptions = useMemo<string[]>(() => Array.from(new Set(projects.map((p) => p.customer))).sort(), [projects]);
  const projectNameOptions = useMemo<string[]>(() => Array.from(new Set(projects.map((p) => p.projectName))).sort(), [projects]);
  const salesRepOptions = useMemo<string[]>(() => Array.from(new Set(projects.map((p) => p.pointPerson).filter(Boolean))).sort(), [projects]);

  // Apply filters + search, then sort
  const visible = useMemo(() => {
    const searchActive = !!search.trim();
    let pool = baseCards;
    if (searchActive && searchScopeAll && !isAll) {
      pool = projects.map(buildCard);
    }
    return pool
      .filter((c) => {
        if (!cardMatchesFilter(c, filters)) return false;
        if (searchActive && !projectMatchesSearch(c.project, search.trim())) return false;
        return true;
      })
      .sort((a, b) => compareCards(a, b, sort, idIndex, supplierName));
  }, [baseCards, projects, filters, sort, idIndex, search, searchScopeAll, isAll, supplierName]);

  const pipeline = PIPELINES.find((p) => p.id === activePipeline)!;
  const hasActiveFilter = filterCount(filters) > 0;
  const isSearching = !!search.trim();

  // ─── Move logic (preserved) ───
  const performMove = (card: PipelineCard, target: { pipeline: PipelineId; stage: StageId }) => {
    if (target.stage === "archive" && card.stage !== "archive") {
      setConfirmLost({ card, target });
      return;
    }
    doMove(card, target);
  };

  const doMove = (card: PipelineCard, target: { pipeline: PipelineId; stage: StageId }) => {
    const v = validateMove(card.project, target);
    if (!v.ok) {
      const labels = v.missing.map((m) =>
        m === "detailSummary" ? "detail summary" : m === "supplier" ? "supplier" : "shipping mode",
      );
      haptics.nope();
      setMissingFields({ card, target, missing: labels });
      return;
    }
    const fromPipeline = card.pipeline;
    const fromStage = card.stage;
    const label = `${card.project.customer} · ${card.project.projectName}`;
    const result = moveCard(card.id, target);
    if (!result.ok) return;
    if (target.pipeline !== fromPipeline) triggerPulse(target.pipeline);

    toast.success(`${label} moved to ${getStageTitle(target.pipeline, target.stage)}`, {
      description: `From ${getStageTitle(fromPipeline, fromStage)}. Tap Undo to reverse.`,
      duration: 5000,
      action: {
        label: "Undo",
        onClick: () => {
          moveCard(card.id, { pipeline: fromPipeline, stage: fromStage });
          toast(`Move undone`, { duration: 2500 });
        },
      },
    });
  };

  const onSwipeForward = (card: PipelineCard) => { const next = nextStage(card); if (next) performMove(card, next); };
  const onSwipeBack = (card: PipelineCard) => { const prev = prevStage(card); if (prev) performMove(card, prev); };
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
    setTimeout(() => { setSelectedCard(buildCard(proj)); setSelectedShipment(null); }, 0);
  };

  // Tab swipe gesture (preserved)
  const TAB_ORDER: TabId[] = ["all", "sales", "operations", "shipping", "finance"];
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => { const t = e.touches[0]; touchStart.current = { x: t.clientX, y: t.clientY }; };
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
  const showSearchScopeToggle = isSearching && !isAll;

  // What pipeline label to show in the search results header
  const searchScopeLabel = isAll
    ? "all pipelines"
    : (searchScopeAll ? "all pipelines" : pipeline.title);

  return (
    <JiggleProvider onPick={(card, target) => performMove(card, target)}>
    <EditModeProvider>
    <div className="min-h-screen bg-background" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <header className="sticky top-0 z-20 bg-background/85 backdrop-blur-md border-b border-border/70">
        {/* Strip 1: app header — tight */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-[max(env(safe-area-inset-top),8px)] pb-1.5 flex items-center justify-between">
          <button
            onClick={() => setHamburgerOpen(true)}
            aria-label="Open menu"
            className="inline-flex items-center justify-center rounded-full border bg-card/60 hover:bg-card transition-colors"
            style={{ borderColor: "hsl(var(--brand-navy) / 0.25)", color: "hsl(var(--brand-navy))", width: 36, height: 36 }}
          >
            <Menu className="h-4 w-4" />
          </button>
          <Wordmark />
          <SettingsMenu />
        </div>

        {/* Strip 2: pipeline tabs — tight */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-1.5">
          <PipelineTabs active={activeTab} onChange={setActiveTab} counts={counts} pulse={pulsePipeline} />
        </div>

        {/* Strip 3: filter / sort / search — tight */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-2">
          <TopControls
            filter={filters}
            sort={sort}
            search={search}
            onSearchChange={setSearch}
            onOpenFilter={() => setFilterSheetOpen(true)}
            onOpenSort={() => setSortSheetOpen(true)}
          />
        </div>
      </header>

      <main key={activeTab} className="max-w-6xl mx-auto px-4 sm:px-6 pt-2.5 pb-6 sm:pt-3 sm:pb-8 space-y-4 sm:space-y-5 animate-fade-in">
        {isSearching && (
          <div className="flex items-center justify-between gap-3 px-1">
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground tabular">{visible.length}</span>{" "}
              result{visible.length === 1 ? "" : "s"} in {searchScopeLabel}
            </p>
            {showSearchScopeToggle && (
              <button
                onClick={() => setSearchScopeAll((v) => !v)}
                className="text-xs font-medium underline underline-offset-4"
                style={{ color: "hsl(var(--brand-navy))" }}
              >
                {searchScopeAll ? `Search only ${pipeline.title}` : "Search all pipelines"}
              </button>
            )}
          </div>
        )}

        {(() => {
          const shippingProjectsFiltered = projects.filter((p) => {
            if (p.pipeline !== "shipping") return false;
            if (!cardMatchesFilter(buildCard(p), filters)) return false;
            if (isSearching && !projectMatchesSearch(p, search.trim())) return false;
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
                hasActiveFilter={hasActiveFilter || isSearching}
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
          Swipe → to advance, ← to send back. Long-press to jump stages. Tap ⋮ for actions.
        </p>
      </main>

      {/* Sheets / drawers */}
      <HamburgerDrawer
        open={hamburgerOpen}
        onClose={() => setHamburgerOpen(false)}
        onOpenSpreadsheet={() => navigate("/spreadsheet")}
        onOpenSuppliers={() => setSuppliersOpen(true)}
        onOpenCustomers={() => setCustomersOpen(true)}
        onOpenShipments={() => setShipmentsListOpen(true)}
        onOpenTrash={() => setTrashOpen(true)}
        trashCount={store.trashedProjects.length}
      />
      <TrashView open={trashOpen} onClose={() => setTrashOpen(false)} />

      <FilterSheet
        open={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        value={filters}
        onChange={setFilters}
        customers={customerOptions}
        projectNames={projectNameOptions}
        suppliers={SUPPLIERS}
        salesReps={salesRepOptions}
      />
      <SortSheet
        open={sortSheetOpen}
        onClose={() => setSortSheetOpen(false)}
        value={sort}
        onChange={setSort}
      />

      <ProjectDetail card={selectedCard} onClose={() => setSelectedCard(null)} onOpenShipment={openShipmentById} />
      <ShipmentView shipment={selectedShipment} onClose={() => setSelectedShipment(null)} onOpenProject={openProjectById} />
      <SuppliersView open={suppliersOpen} onClose={() => setSuppliersOpen(false)}
        onOpenProject={(id) => { setSuppliersOpen(false); openProjectById(id); }} />
      <CustomersView open={customersOpen} onClose={() => setCustomersOpen(false)} />
      <ShipmentsView
        open={shipmentsListOpen}
        onClose={() => setShipmentsListOpen(false)}
        shipments={shipments}
        projects={projects}
        onOpenShipment={openShipmentById}
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
    </EditModeProvider>
    </JiggleProvider>
  );
};

import { getNextStage as nextS, getPrevStage as prevS } from "@/hooks/usePipelineStore";
function nextStage(card: PipelineCard) { return nextS(card.pipeline, card.stage); }
function prevStage(card: PipelineCard) { return prevS(card.pipeline, card.stage); }

export default Index;
