import { CalendarDays, User2, Plane, Ship, Repeat, Sparkles, CornerDownRight, Container } from "lucide-react";
import { PipelineCard, STAGE_ACCENT } from "@/data/pipelines";
import { cn } from "@/lib/utils";

interface ProjectCardProps {
  card: PipelineCard;
  onOpen: () => void;
  onOpenMaster: () => void;
  onOpenShipment?: () => void;
}

const TODAY = new Date(2026, 4, 8);

function getUrgency(date: Date) {
  const diff = Math.ceil((date.getTime() - TODAY.getTime()) / 86400000);
  if (diff < 0) return { label: `${Math.abs(diff)}d overdue`, tone: "urgent" as const };
  if (diff <= 7) return { label: `in ${diff}d`, tone: "urgent" as const };
  if (diff <= 14) return { label: `in ${diff}d`, tone: "soon" as const };
  return { label: `in ${diff}d`, tone: "neutral" as const };
}

const accentBgClass: Record<string, string> = {
  indigo: "bg-stage-indigo", amber: "bg-stage-amber", emerald: "bg-stage-emerald",
  rose: "bg-stage-rose", slate: "bg-stage-slate", violet: "bg-stage-violet",
  orange: "bg-stage-orange", teal: "bg-stage-teal", sky: "bg-stage-sky",
  cyan: "bg-stage-cyan", fuchsia: "bg-stage-fuchsia",
};

export const ProjectCard = ({ card, onOpen, onOpenMaster, onOpenShipment }: ProjectCardProps) => {
  const u = getUrgency(card.deadlineDate);
  const accent = STAGE_ACCENT[card.stage];
  const ShipIcon = card.shippingMode === "Air" ? Plane : Ship;

  const isSub = card.kind === "sub";
  const titleLine = isSub
    ? `${card.sub!.itemName}`
    : card.master.customer;
  const subline = isSub
    ? card.supplier?.name
    : card.master.pointPerson;

  return (
    <div
      className={cn(
        "group w-full text-left relative overflow-hidden rounded-2xl bg-card border border-border/70",
        "shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-section)]",
        "transition-[var(--transition-smooth)] hover:-translate-y-0.5",
      )}
    >
      <span className={cn("absolute left-0 top-0 bottom-0 w-1", accentBgClass[accent])} />

      {/* Master badge — only on sub cards */}
      {isSub && (
        <button
          onClick={(e) => { e.stopPropagation(); onOpenMaster(); }}
          className="w-full text-left pl-5 pr-4 pt-3 pb-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors group/badge"
        >
          <CornerDownRight className="h-3 w-3 opacity-70" />
          <span className="font-medium tracking-tight truncate">
            {card.master.projectName}
          </span>
          <span className="text-muted-foreground/60">·</span>
          <span className="truncate">{card.master.customer}</span>
        </button>
      )}

      <button onClick={onOpen} className="w-full text-left px-5 pt-2 pb-5">
        <div className={cn("flex items-start justify-between gap-3 mb-1.5", !isSub && "pt-3")}>
          <h3 className="font-semibold text-foreground leading-tight tracking-tight">
            {titleLine}
          </h3>
          {card.priority === "Rush" && (
            <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-urgent/10 text-urgent shrink-0 inline-flex items-center gap-1">
              <Sparkles className="h-2.5 w-2.5" /> Rush
            </span>
          )}
        </div>

        {subline && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
            <User2 className="h-3 w-3" />
            <span>{subline}</span>
          </div>
        )}

        <p className="text-sm text-foreground/80 leading-snug mb-4">
          {isSub ? (
            <span className="text-muted-foreground">{card.sub!.summary}</span>
          ) : (
            <>
              <span className="font-medium">{card.master.projectName}</span>
              <span className="text-muted-foreground"> — {card.master.summary}</span>
            </>
          )}
        </p>

        <div className="flex flex-wrap items-center gap-1.5 mb-4">
          <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
            <ShipIcon className="h-2.5 w-2.5" /> {card.shippingMode}
          </span>
          {card.orderType === "Re-order" && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
              <Repeat className="h-2.5 w-2.5" /> Re-order
            </span>
          )}
          {card.shipment && (
            <span
              role="button"
              onClick={(e) => { e.stopPropagation(); onOpenShipment?.(); }}
              className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-foreground/90 text-background hover:bg-foreground transition-colors"
            >
              <Container className="h-2.5 w-2.5" /> {card.shipment.code}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-border/60">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" />
            <span className="font-medium text-foreground/80">{card.deadline}</span>
          </div>
          <span
            className={cn(
              "text-xs font-semibold tabular-nums px-2 py-0.5 rounded-full",
              u.tone === "urgent" && "bg-urgent/10 text-urgent",
              u.tone === "soon" && "bg-soon/10 text-soon",
              u.tone === "neutral" && "text-muted-foreground",
            )}
          >
            {u.label}
          </span>
        </div>
      </button>
    </div>
  );
};
