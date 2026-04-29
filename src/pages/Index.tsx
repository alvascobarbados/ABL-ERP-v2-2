import { useMemo, useRef, useState } from "react";
import {
  PIPELINES, PipelineId, PipelineCard, MasterProject, Shipment,
  buildCards, pipelineCounts, MASTERS, SHIPMENTS, SUBS, SUPPLIERS, getMaster, getShipment,
} from "@/data/pipelines";
import { StageSection } from "@/components/leads/StageSection";
import { PipelineTabs } from "@/components/leads/PipelineTabs";
import { FilterBar, FilterState } from "@/components/leads/FilterBar";
import { ProjectDetail } from "@/components/leads/ProjectDetail";
import { MasterProjectView } from "@/components/leads/MasterProjectView";
import { ShipmentView } from "@/components/leads/ShipmentView";
import { SuppliersView } from "@/components/leads/SuppliersView";
import { Factory } from "lucide-react";
import { cn } from "@/lib/utils";

const Index = () => {
  const [activePipeline, setActivePipeline] = useState<PipelineId>("sales");
  const [filters, setFilters] = useState<FilterState>({ shippingMode: null, orderType: null, priority: null, customer: null, supplierId: null });

  const [selectedCard, setSelectedCard] = useState<PipelineCard | null>(null);
  const [selectedMaster, setSelectedMaster] = useState<MasterProject | null>(null);
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);
  const [suppliersOpen, setSuppliersOpen] = useState(false);

  const counts = useMemo(pipelineCounts, []);

  const cards = useMemo(() => buildCards(activePipeline), [activePipeline]);

  const customerOptions = useMemo(
    () => Array.from(new Set(MASTERS.map((m) => m.customer))).sort(),
    [],
  );

  const visible = useMemo(() => {
    return cards.filter((c) => {
      if (filters.shippingMode && c.shippingMode !== filters.shippingMode) return false;
      if (filters.orderType && c.orderType !== filters.orderType) return false;
      if (filters.priority && c.priority !== filters.priority) return false;
      if (filters.customer && c.master.customer !== filters.customer) return false;
      if (filters.supplierId) {
        // master cards (Sales) match if any of their subs use this supplier; sub cards match directly
        if (c.kind === "sub") {
          if (c.sub?.supplierId !== filters.supplierId) return false;
        } else {
          const masterSubs = SUBS.filter((s) => s.masterId === c.master.id);
          if (!masterSubs.some((s) => s.supplierId === filters.supplierId)) return false;
        }
      }
      return true;
    });
  }, [cards, filters]);

  const pipeline = PIPELINES.find((p) => p.id === activePipeline)!;

  // Cross-view helpers
  const openMasterById = (id: string) => {
    const m = getMaster(id) ?? MASTERS.find((x) => x.id === id) ?? null;
    setSelectedMaster(m);
    setSelectedCard(null);
    setSelectedShipment(null);
  };
  const openShipmentById = (id: string) => {
    setSelectedShipment(getShipment(id) ?? null);
    setSelectedCard(null);
    setSelectedMaster(null);
  };
  const openSubById = (id: string) => {
    const sub = SUBS.find((s) => s.id === id);
    if (!sub) return;
    const list = buildCards(sub.pipeline);
    const card = list.find((c) => c.id === sub.id) ?? null;
    if (card) {
      setActivePipeline(sub.pipeline);
      setSelectedCard(card);
      setSelectedMaster(null);
      setSelectedShipment(null);
    }
  };

  // Swipe gesture
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

  return (
    <div className="min-h-screen bg-background" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <header className="sticky top-0 z-20 bg-background/85 backdrop-blur-md border-b border-border/70">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 pt-5 pb-3">
          <div className="flex items-end justify-between mb-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground font-medium mb-1">
                Operations
              </p>
              <h1 key={pipeline.id} className="font-serif-display text-3xl sm:text-4xl font-semibold text-foreground tracking-tight animate-fade-in">
                {pipeline.title}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSuppliersOpen(true)}
                className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border border-border bg-card/60 text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                aria-label="Open suppliers"
              >
                <Factory className="h-3.5 w-3.5" /> Suppliers
              </button>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">In pipeline</p>
                <p className="text-2xl font-semibold text-foreground tabular-nums">{visible.length}</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <PipelineTabs active={activePipeline} onChange={setActivePipeline} counts={counts} />
            <div className="flex items-center gap-1">
              {PIPELINES.map((p, i) => {
                const idx = PIPELINES.findIndex((x) => x.id === activePipeline);
                return (
                  <span
                    key={p.id}
                    className={cn(
                      "h-1 rounded-full transition-all duration-300",
                      i === idx ? "w-6 bg-foreground" : "w-1.5 bg-muted-foreground/30",
                    )}
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
      </header>

      <main key={activePipeline} className="max-w-6xl mx-auto px-5 sm:px-8 py-5 sm:py-7 space-y-4 sm:space-y-5 animate-fade-in">
        {pipeline.stages.map((stage) => (
          <StageSection
            key={stage.id}
            title={stage.title}
            stage={stage.id}
            cards={visible.filter((c) => c.stage === stage.id)}
            onOpenCard={setSelectedCard}
            onOpenMaster={openMasterById}
            onOpenShipment={openShipmentById}
          />
        ))}

        {activePipeline === "shipping" && SHIPMENTS.length > 0 && (
          <section className="bg-card/70 backdrop-blur-sm rounded-2xl shadow-[var(--shadow-card)] border border-border/60 p-5">
            <div className="font-serif-display text-lg font-semibold mb-3">Active shipments</div>
            <div className="flex flex-wrap gap-2">
              {SHIPMENTS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => openShipmentById(s.id)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-full bg-foreground text-background hover:opacity-90 transition-opacity"
                >
                  {s.code} · {s.mode} · {s.status}
                </button>
              ))}
            </div>
          </section>
        )}

        <p className="text-center text-xs text-muted-foreground pt-4 pb-2">
          Swipe ← → to move between pipelines
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
    </div>
  );
};

export default Index;
