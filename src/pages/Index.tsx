import { useMemo, useRef, useState } from "react";
import { allProjects, PIPELINES, PipelineId, Project } from "@/data/pipelines";
import { StageSection } from "@/components/leads/StageSection";
import { PipelineTabs } from "@/components/leads/PipelineTabs";
import { FilterBar, FilterState } from "@/components/leads/FilterBar";
import { ProjectDetail } from "@/components/leads/ProjectDetail";
import { cn } from "@/lib/utils";

const Index = () => {
  const [activePipeline, setActivePipeline] = useState<PipelineId>("sales");
  const [filters, setFilters] = useState<FilterState>({ shippingMode: null, orderType: null, priority: null });
  const [selected, setSelected] = useState<Project | null>(null);

  const counts = useMemo(() => {
    const c: Record<PipelineId, number> = { sales: 0, production: 0, shipping: 0, finance: 0 };
    allProjects.forEach((p) => { c[p.pipeline]++; });
    return c;
  }, []);

  const visible = useMemo(() => {
    return allProjects.filter((p) => {
      if (p.pipeline !== activePipeline) return false;
      if (filters.shippingMode && p.shippingMode !== filters.shippingMode) return false;
      if (filters.orderType && p.orderType !== filters.orderType) return false;
      if (filters.priority && p.priority !== filters.priority) return false;
      return true;
    });
  }, [activePipeline, filters]);

  const pipeline = PIPELINES.find((p) => p.id === activePipeline)!;

  // ─── Swipe gesture (touch) ───
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
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">In pipeline</p>
              <p className="text-2xl font-semibold text-foreground tabular-nums">{visible.length}</p>
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
            <FilterBar value={filters} onChange={setFilters} />
          </div>
        </div>
      </header>

      <main key={activePipeline} className="max-w-6xl mx-auto px-5 sm:px-8 py-5 sm:py-7 space-y-4 sm:space-y-5 animate-fade-in">
        {pipeline.stages.map((stage) => (
          <StageSection
            key={stage.id}
            title={stage.title}
            stage={stage.id}
            projects={visible.filter((p) => p.stage === stage.id)}
            onProjectClick={setSelected}
          />
        ))}

        <p className="text-center text-xs text-muted-foreground pt-4 pb-2">
          Swipe ← → to move between pipelines
        </p>
      </main>

      <ProjectDetail project={selected} onClose={() => setSelected(null)} />
    </div>
  );
};

export default Index;
