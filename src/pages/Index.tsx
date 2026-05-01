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
import { FilterState } from "@/components/leads/FilterBar";
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
import { ConfirmDialog } from "@/components/leads/ConfirmDialog";
import { ShippingPipelineView, ShippingFilter } from "@/components/leads/ShippingPipelineView";
import { AllPipelineView } from "@/components/leads/AllPipelineView";
import { AssignShipmentSheet } from "@/components/leads/AssignShipmentSheet";
import type { TabId } from "@/components/leads/PipelineTabs";
import { JiggleProvider } from "@/hooks/useJiggle";
import { EditModeProvider } from "@/hooks/useEditMode";
import { haptics } from "@/lib/haptics";

// Picker reused from FilterBar (was internal). Re-create a tiny inline one here to keep customer/project/supplier pickers working.
import { useEffect as useEffect2 } from "react";
import { Check, Search as SearchIcon, X, Users, Briefcase, Factory } from "lucide-react";
import { cn } from "@/lib/utils";

interface PickerSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  icon: React.ReactNode;
  options: { id: string; label: string }[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}
const PickerSheet = ({ open, onClose, title, icon, options, selectedId, onSelect }: PickerSheetProps) => {
  const [query, setQuery] = useState("");
  useEffect2(() => { if (!open) setQuery(""); }, [open]);
  useEffect2(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open, onClose]);
  if (!open) return null;
  const filtered = options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="fixed inset-0 z-[60] flex flex-col sm:items-center sm:justify-center sm:p-6">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/40 animate-fade-in" />
      <div className={cn(
        "relative bg-card shadow-[var(--shadow-section)] border animate-fade-in",
        "mt-auto rounded-t-3xl w-full max-h-[85vh] flex flex-col",
        "sm:mt-0 sm:rounded-2xl sm:max-w-md sm:w-full sm:max-h-[70vh]",
      )} style={{ borderColor: "hsl(var(--brand-navy) / 0.15)" }}>
        <div className="sm:hidden flex justify-center pt-2.5 pb-1 shrink-0">
          <span className="block w-10 h-1.5 rounded-full bg-muted-foreground/30" />
        </div>
        <div className="px-5 pt-3 pb-3 flex items-center justify-between border-b border-border/60 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="inline-flex items-center justify-center rounded-full shrink-0"
              style={{ width: 32, height: 32, backgroundColor: "hsl(var(--brand-navy) / 0.08)", color: "hsl(var(--brand-navy))" }}>{icon}</span>
            <h3 className="text-base font-semibold tracking-tight truncate" style={{ color: "hsl(var(--brand-navy))" }}>{title}</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="inline-flex items-center justify-center rounded-full hover:bg-muted/60 text-muted-foreground"
            style={{ width: 36, height: 36 }}><X className="h-4 w-4" /></button>
        </div>
        <div className="px-4 py-3 border-b border-border/60 shrink-0">
          <div className="flex items-center gap-2 rounded-xl border bg-background/60 px-3"
            style={{ borderColor: "hsl(var(--brand-navy) / 0.2)", minHeight: 48 }}>
            <SearchIcon className="h-4 w-4 text-muted-foreground shrink-0" />
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${title.toLowerCase()}…`}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground text-foreground py-2" />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label="Clear search"
                className="p-1 rounded-md hover:bg-muted/60 text-muted-foreground shrink-0"><X className="h-3.5 w-3.5" /></button>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground italic px-4 py-6 text-center">No matches.</p>
          ) : (
            <ul className="flex flex-col">
              {filtered.map((o) => {
                const isSelected = selectedId === o.id;
                return (
                  <li key={o.id}>
                    <button type="button" onClick={() => { onSelect(o.id); onClose(); }}
                      className={cn(
                        "w-full text-left rounded-xl flex items-center justify-between gap-3 px-3 transition-colors",
                        isSelected ? "bg-muted/70 font-medium text-foreground" : "hover:bg-muted/40",
                      )} style={{ minHeight: 52 }}>
                      <span className="text-[15px] truncate">{o.label}</span>
                      {isSelected && (
                        <span className="inline-flex items-center justify-center rounded-full text-white shrink-0"
                          style={{ width: 22, height: 22, backgroundColor: "hsl(var(--brand-orange))" }}>
                          <Check className="h-3 w-3" />
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="px-4 pt-3 pb-[max(env(safe-area-inset-bottom),16px)] border-t border-border/60 flex gap-2 shrink-0">
          {selectedId ? (
            <button type="button" onClick={() => { onSelect(null); onClose(); }}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border text-sm font-medium hover:bg-muted/40 transition-colors"
              style={{ borderColor: "hsl(var(--brand-navy) / 0.3)", color: "hsl(var(--brand-navy))", minHeight: 48 }}>
              <X className="h-4 w-4" /> Clear filter
            </button>
          ) : (
            <button type="button" onClick={onClose}
              className="flex-1 inline-flex items-center justify-center rounded-xl border text-sm font-medium hover:bg-muted/40 transition-colors"
              style={{ borderColor: "hsl(var(--brand-navy) / 0.3)", color: "hsl(var(--brand-navy))", minHeight: 48 }}>
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Sort persistence per-tab ───
const SORT_STORAGE = "alvasco.sort.v1";
const DEFAULT_SORTS: Record<TabId, SortState> = {
  all: { field: "deadline", dir: "asc" },
  sales: { field: "deadline", dir: "asc" },
  operations: { field: "deadline", dir: "asc" },
  shipping: { field: "deadline", dir: "asc" }, // ETA approximated by deadline; shipping view groups by Air/Ocean anyway
  finance: { field: "deadline", dir: "asc" },  // most overdue first
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

function compareCards(a: PipelineCard, b: PipelineCard, sort: SortState, idIndex: Map<string, number>): number {
  const dir = sort.dir === "asc" ? 1 : -1;
  switch (sort.field) {
    case "deadline":
      return dir * (a.deadlineDate.getTime() - b.deadlineDate.getTime());
    case "created": {
      const ai = idIndex.get(a.id) ?? 0;
      const bi = idIndex.get(b.id) ?? 0;
      return dir * (ai - bi);
    }
    case "customer":
      return dir * a.project.customer.localeCompare(b.project.customer);
    case "projectName":
      return dir * a.project.projectName.localeCompare(b.project.projectName);
    case "quote": {
      const av = a.project.quoteNumber ?? "";
      const bv = b.project.quoteNumber ?? "";
      if (av && !bv) return -1;
      if (!av && bv) return 1;
      return dir * av.localeCompare(bv, undefined, { numeric: true });
    }
  }
}

function projectMatchesSearch(p: Project, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  const fields = [
    p.customer, p.projectName, p.detailSummary ?? "", p.contactPerson ?? "",
    p.quoteNumber ?? "", p.poNumber ?? "", p.invoiceNumber ?? "", p.trackingRef ?? "",
  ];
  return fields.some((f) => f.toLowerCase().includes(needle));
}

const Index = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const store = usePipelineStore();
  const { projects, shipments, moveCard, pulsePipeline, triggerPulse } = store;

  const [activeTab, setActiveTab] = useState<TabId>("sales");
  const activePipeline: PipelineId = activeTab === "all" ? "sales" : activeTab;
  const isAll = activeTab === "all";
  const [filters, setFilters] = useState<FilterState>({ customer: null, projectName: null, supplierId: null });

  const [selectedCard, setSelectedCard] = useState<PipelineCard | null>(null);
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);

  const [hamburgerOpen, setHamburgerOpen] = useState(false);
  const [suppliersOpen, setSuppliersOpen] = useState(false);
  const [customersOpen, setCustomersOpen] = useState(false);
  const [shipmentsListOpen, setShipmentsListOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [sortSheetOpen, setSortSheetOpen] = useState(false);
  const [filterPicker, setFilterPicker] = useState<null | "customer" | "project" | "supplier">(null);

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

  // Index for "date created" sort proxy = order in seed data
  const idIndex = useMemo(() => {
    const m = new Map<string, number>();
    projects.forEach((p, i) => m.set(p.id, i));
    return m;
  }, [projects]);

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

  // Apply filters + search, then sort
  const visible = useMemo(() => {
    const searchActive = !!search.trim();
    let pool = baseCards;
    if (searchActive && searchScopeAll && !isAll) {
      // Searching globally from a single pipeline tab
      pool = projects.map(buildCard);
    }
    return pool
      .filter((c) => {
        if (filters.customer && c.project.customer !== filters.customer) return false;
        if (filters.projectName && c.project.projectName !== filters.projectName) return false;
        if (filters.supplierId && c.project.supplierId !== filters.supplierId) return false;
        if (searchActive && !projectMatchesSearch(c.project, search.trim())) return false;
        return true;
      })
      .sort((a, b) => compareCards(a, b, sort, idIndex));
  }, [baseCards, projects, filters, sort, idIndex, search, searchScopeAll, isAll]);

  const pipeline = PIPELINES.find((p) => p.id === activePipeline)!;
  const hasActiveFilter = !!(filters.customer || filters.projectName || filters.supplierId);
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
        {/* Strip 1: app header */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-[max(env(safe-area-inset-top),10px)] pb-2.5 flex items-center justify-between">
          <button
            onClick={() => setHamburgerOpen(true)}
            aria-label="Open menu"
            className="inline-flex items-center justify-center rounded-full border bg-card/60 hover:bg-card transition-colors"
            style={{ borderColor: "hsl(var(--brand-navy) / 0.25)", color: "hsl(var(--brand-navy))", width: 36, height: 36 }}
          >
            <Menu className="h-4 w-4" />
          </button>
          <h1 className="font-display text-base sm:text-lg font-semibold tracking-[0.18em]"
            style={{ color: "hsl(var(--brand-navy))" }}>
            ALVASCO ERP
          </h1>
          <SettingsMenu />
        </div>

        {/* Strip 2: pipeline tabs */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-2.5">
          <PipelineTabs active={activeTab} onChange={setActiveTab} counts={counts} pulse={pulsePipeline} />
        </div>

        {/* Strip 3: filter / sort / search */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-3">
          <TopControls
            filter={filters}
            sort={sort}
            search={search}
            onSearchChange={setSearch}
            onOpenFilter={() => setFilterSheetOpen(true)}
            onOpenSort={() => setSortSheetOpen(true)}
          />
        </div>

        <div className="h-[3px] w-full transition-colors duration-300" style={{ backgroundColor: accentHex }} />
      </header>

      <main key={activeTab} className="max-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-5 animate-fade-in">
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
            if (filters.supplierId && p.supplierId !== filters.supplierId) return false;
            if (filters.customer && p.customer !== filters.customer) return false;
            if (filters.projectName && p.projectName !== filters.projectName) return false;
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
        onOpenPicker={(kind) => setFilterPicker(kind)}
      />
      <SortSheet
        open={sortSheetOpen}
        onClose={() => setSortSheetOpen(false)}
        value={sort}
        onChange={setSort}
      />

      <PickerSheet
        open={filterPicker === "customer"}
        onClose={() => setFilterPicker(null)}
        title="Filter by customer"
        icon={<Users className="h-4 w-4" />}
        options={customerOptions.map((c) => ({ id: c, label: c }))}
        selectedId={filters.customer}
        onSelect={(id) => setFilters({ ...filters, customer: id })}
      />
      <PickerSheet
        open={filterPicker === "project"}
        onClose={() => setFilterPicker(null)}
        title="Filter by project"
        icon={<Briefcase className="h-4 w-4" />}
        options={projectNameOptions.map((n) => ({ id: n, label: n }))}
        selectedId={filters.projectName}
        onSelect={(id) => setFilters({ ...filters, projectName: id })}
      />
      <PickerSheet
        open={filterPicker === "supplier"}
        onClose={() => setFilterPicker(null)}
        title="Filter by supplier"
        icon={<Factory className="h-4 w-4" />}
        options={SUPPLIERS.map((s) => ({ id: s.id, label: s.name }))}
        selectedId={filters.supplierId}
        onSelect={(id) => setFilters({ ...filters, supplierId: id })}
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
