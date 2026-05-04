/**
 * Pipeline stat cards — desktop tab strip.
 *
 * Layout (left → right):
 *   [Active]  ←extra gap→  [Sales] › [Design] › [Purchasing] › [Production] › [Shipping] › [Finance]  ←extra gap→  [Completed]
 *
 * - Workflow cards (6 pipelines) are full-size, equal-flex, and connected by
 *   small ChevronRight arrows in the gaps between them indicating flow.
 * - Active and Completed are bookend "summary buckets" — narrower (~78%
 *   width), shorter, with smaller text/count and muted icons. Separated from
 *   the workflow row by an extra ~18px gap. No flow arrows attach to them.
 * - When a multi-stage pipeline (sales / design / finance) is active, the
 *   parent renders a sub-row via the `subRow` prop. This component
 *   absolutely-positions that sub-row directly under the active card with a
 *   small upward-pointing notch (tooltip-style anchor), so the sub-row reads
 *   as a child of the active card rather than a free-floating bar.
 */
import { cn } from "@/lib/utils";
import {
  Radio, TrendingUp, PenTool, ShoppingCart, Settings,
  Truck, DollarSign, CheckCircle2, ChevronRight,
} from "lucide-react";
import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { PIPELINES, PipelineId } from "@/data/pipelines";
import { PIPELINE_ACCENT } from "@/lib/brand";
import type { TabId } from "./PipelineTabs";

interface Props {
  active: TabId;
  onChange: (id: TabId) => void;
  /** Filtered counts per pipeline — update live as filters change. */
  counts: Record<PipelineId, number>;
  completedCount?: number;
  pulse?: PipelineId | null;
  loading?: boolean;
  /** Optional sub-row content (e.g. SubChevron). Anchored under active card. */
  subRow?: ReactNode;
  /** Tint hex used for the sub-row background + notch. */
  subRowAccent?: string;
}

const ICON_FOR: Record<TabId, typeof Radio> = {
  all: Radio,
  sales: TrendingUp,
  design: PenTool,
  purchasing: ShoppingCart,
  production: Settings,
  operations: Settings,
  shipping: Truck,
  finance: DollarSign,
  completed: CheckCircle2,
};

const SAGE = "#6B8E5A";
const BOOKEND_GAP = 18; // extra horizontal space separating bookends from workflow row

const CountSlot = ({ value, loading, fontSize }: { value: number; loading?: boolean; fontSize: number }) => {
  if (loading) {
    return (
      <span
        aria-hidden
        className="inline-block rounded animate-pulse"
        style={{
          width: Math.round(fontSize * 1.3), height: Math.round(fontSize * 0.92),
          backgroundColor: "currentColor",
          opacity: 0.2,
        }}
      />
    );
  }
  return <span style={{ fontSize, lineHeight: 1 }}>{value}</span>;
};

interface CardProps {
  id: TabId;
  title: string;
  count: number;
  active: boolean;
  accent: string;
  onClick: () => void;
  pulse?: boolean;
  loading?: boolean;
  /** "workflow" = full-size hero card; "bookend" = quieter summary card. */
  variant: "workflow" | "bookend";
  cardRef?: (el: HTMLButtonElement | null) => void;
}

const StatCard = ({ id, title, count, active, accent, onClick, pulse, loading, variant, cardRef }: CardProps) => {
  const Icon = ICON_FOR[id];
  const isBookend = variant === "bookend";

  const fillBg = active ? accent : "#FFFFFF";
  const fillBorder = active ? accent : "hsl(var(--brand-navy) / 0.1)";
  const titleColor = active ? "rgba(255,255,255,0.85)" : "hsl(var(--brand-navy) / 0.7)";
  const countColor = active ? "#fff" : "hsl(var(--brand-navy))";
  const iconColor = active ? "rgba(255,255,255,0.95)" : accent;
  const iconOpacity = active ? 1 : (isBookend ? 0.6 : 0.8);

  const titleSize = isBookend ? 11 : 12.5;
  const countSize = isBookend ? 23 : 30;
  const iconSize = isBookend ? 17 : 20;
  const height = isBookend ? 72 : 86;
  const padding = isBookend ? "9px 11px" : "12px 14px";
  const minWidth = isBookend ? 118 : 152;
  const flexBasis = isBookend ? "0 0 auto" : "1 1 0%";
  const flexWidth = isBookend ? 122 : undefined;

  return (
    <button
      ref={cardRef}
      type="button"
      onClick={onClick}
      className={cn("shrink-0 relative flex flex-col text-left transition-all rounded-xl border hover:shadow-sm")}
      style={{
        flex: flexBasis,
        width: flexWidth,
        minWidth,
        height,
        padding,
        backgroundColor: fillBg,
        borderColor: fillBorder,
        borderWidth: 1,
        boxShadow: pulse ? "0 0 0 2px hsl(var(--brand-orange))" : undefined,
      }}
    >
      <div className="flex items-start justify-between gap-2 w-full">
        <span
          className="font-medium tracking-tight truncate"
          style={{ color: titleColor, fontSize: titleSize }}
        >
          {title}
        </span>
        <Icon
          className="shrink-0"
          style={{ width: iconSize, height: iconSize, color: iconColor, opacity: iconOpacity }}
        />
      </div>
      <div
        className="mt-auto font-bold tabular leading-none"
        style={{ color: countColor }}
      >
        <CountSlot value={count} loading={loading} fontSize={countSize} />
      </div>
    </button>
  );
};

const FlowArrow = ({ bright }: { bright: boolean }) => (
  <div
    className="shrink-0 flex items-center justify-center transition-opacity"
    style={{ width: 14, alignSelf: "stretch" }}
    aria-hidden
  >
    <ChevronRight
      style={{
        width: 14, height: 14,
        color: "hsl(var(--brand-navy))",
        opacity: bright ? 0.5 : 0.32,
      }}
    />
  </div>
);

export const PipelineStatCards = ({
  active, onChange, counts, completedCount = 0, pulse, loading, subRow, subRowAccent,
}: Props) => {
  const activeCount =
    counts.sales + counts.design + counts.purchasing + counts.production +
    counts.shipping + counts.finance + counts.operations;

  // Refs to each card so we can measure the active card and anchor the sub-row.
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Partial<Record<TabId, HTMLButtonElement | null>>>({});
  const [anchor, setAnchor] = useState<{ left: number; width: number } | null>(null);

  const measure = () => {
    const root = containerRef.current;
    const el = cardRefs.current[active];
    if (!root || !el) { setAnchor(null); return; }
    const r = root.getBoundingClientRect();
    const c = el.getBoundingClientRect();
    setAnchor({ left: c.left - r.left, width: c.width });
  };

  useLayoutEffect(() => { measure(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [active, subRow != null]);

  useEffect(() => {
    if (!subRow) return;
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    Object.values(cardRefs.current).forEach((el) => { if (el) ro.observe(el); });
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subRow != null]);

  // Determine workflow chevron arrow ordering (between consecutive workflow pipelines)
  // active card index helps slightly brighten the arrow leaving it.
  const workflowIds: PipelineId[] = ["sales", "design", "purchasing", "production", "shipping", "finance"];
  const activeIdx = workflowIds.indexOf(active as PipelineId);

  const setRef = (id: TabId) => (el: HTMLButtonElement | null) => { cardRefs.current[id] = el; };

  return (
    <div ref={containerRef} className="relative w-full">
      <div
        className="flex items-stretch w-full overflow-x-auto"
        style={{ scrollbarWidth: "thin", gap: 0 }}
      >
        {/* Active bookend */}
        <StatCard
          id="all"
          title="Active"
          count={activeCount}
          active={active === "all"}
          accent="hsl(var(--brand-navy))"
          onClick={() => onChange("all")}
          loading={loading}
          variant="bookend"
          cardRef={setRef("all")}
        />

        {/* Bookend → workflow gap */}
        <div style={{ width: BOOKEND_GAP }} aria-hidden />

        {/* Workflow cards with chevron arrows between them */}
        {workflowIds.map((p, i) => {
          const meta = PIPELINES.find((x) => x.id === p);
          if (!meta) return null;
          return (
            <div key={p} className="flex items-stretch" style={{ flex: "1 1 0%", minWidth: 152, gap: 0 }}>
              {i > 0 && (
                <div style={{ paddingLeft: 5, paddingRight: 5 }}>
                  <FlowArrow bright={activeIdx === i - 1} />
                </div>
              )}
              <div className="flex-1 min-w-0 flex">
                <StatCard
                  id={p}
                  title={meta.title}
                  count={counts[p]}
                  active={active === p}
                  accent={PIPELINE_ACCENT[p].hex}
                  onClick={() => onChange(p)}
                  pulse={pulse === p}
                  loading={loading}
                  variant="workflow"
                  cardRef={setRef(p)}
                />
              </div>
            </div>
          );
        })}

        {/* Workflow → bookend gap */}
        <div style={{ width: BOOKEND_GAP }} aria-hidden />

        {/* Completed bookend */}
        <StatCard
          id="completed"
          title="Completed"
          count={completedCount}
          active={active === "completed"}
          accent={SAGE}
          onClick={() => onChange("completed")}
          loading={loading}
          variant="bookend"
          cardRef={setRef("completed")}
        />
      </div>

      {/* Sub-row, anchored under active card */}
      {subRow && anchor && (
        <div
          className="relative"
          style={{
            marginTop: 0,
            height: 0,
          }}
        >
          <div
            style={{
              position: "relative",
              left: anchor.left,
              width: anchor.width,
              transition: "left 220ms cubic-bezier(0.2,0.8,0.2,1), width 220ms cubic-bezier(0.2,0.8,0.2,1)",
            }}
          >
            {/* Notch (triangle) at top center, pointing up */}
            <div
              aria-hidden
              style={{
                position: "absolute",
                top: -8,
                left: "50%",
                transform: "translateX(-50%)",
                width: 0, height: 0,
                borderLeft: "8px solid transparent",
                borderRight: "8px solid transparent",
                borderBottom: `8px solid ${
                  subRowAccent
                    ? `color-mix(in srgb, ${subRowAccent} 10%, #FFFFFF)`
                    : "hsl(var(--background))"
                }`,
              }}
            />
            <div
              className="rounded-b-xl rounded-t-md"
              style={{
                backgroundColor: subRowAccent
                  ? `color-mix(in srgb, ${subRowAccent} 10%, #FFFFFF)`
                  : "hsl(var(--background))",
                padding: "5px 6px",
                transition: "background-color 220ms ease",
              }}
            >
              {subRow}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
