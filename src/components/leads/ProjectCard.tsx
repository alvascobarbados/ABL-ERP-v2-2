import { CalendarDays, User2, Plane, Ship, Repeat, Sparkles } from "lucide-react";
import { Project, STAGE_ACCENT } from "@/data/pipelines";
import { cn } from "@/lib/utils";

interface ProjectCardProps {
  project: Project;
  onClick?: () => void;
}

const TODAY = new Date(2026, 4, 8); // pinned demo "today"

function getUrgency(date: Date) {
  const diff = Math.ceil((date.getTime() - TODAY.getTime()) / 86400000);
  if (diff < 0) return { label: `${Math.abs(diff)}d overdue`, tone: "urgent" as const, days: diff };
  if (diff <= 7) return { label: `in ${diff}d`, tone: "urgent" as const, days: diff };
  if (diff <= 14) return { label: `in ${diff}d`, tone: "soon" as const, days: diff };
  return { label: `in ${diff}d`, tone: "neutral" as const, days: diff };
}

const accentBgClass: Record<string, string> = {
  indigo: "bg-stage-indigo", amber: "bg-stage-amber", emerald: "bg-stage-emerald",
  rose: "bg-stage-rose", slate: "bg-stage-slate", violet: "bg-stage-violet",
  orange: "bg-stage-orange", teal: "bg-stage-teal", sky: "bg-stage-sky",
  cyan: "bg-stage-cyan", fuchsia: "bg-stage-fuchsia",
};

export const ProjectCard = ({ project, onClick }: ProjectCardProps) => {
  const u = getUrgency(project.deadlineDate);
  const accent = STAGE_ACCENT[project.stage];
  const ShipIcon = project.shippingMode === "Air" ? Plane : Ship;

  return (
    <button
      onClick={onClick}
      className={cn(
        "group w-full text-left relative overflow-hidden rounded-2xl bg-card p-5 border border-border/70",
        "shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-section)]",
        "transition-[var(--transition-smooth)] hover:-translate-y-0.5 active:translate-y-0",
      )}
    >
      <span className={cn("absolute left-0 top-0 bottom-0 w-1", accentBgClass[accent])} />

      <div className="flex items-start justify-between gap-3 mb-1.5">
        <h3 className="font-semibold text-foreground leading-tight tracking-tight">
          {project.customer}
        </h3>
        {project.priority === "Rush" && (
          <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-urgent/10 text-urgent shrink-0 inline-flex items-center gap-1">
            <Sparkles className="h-2.5 w-2.5" /> Rush
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
        <User2 className="h-3 w-3" />
        <span>{project.pointPerson}</span>
      </div>

      <p className="text-sm text-foreground/80 leading-snug mb-4">
        <span className="font-medium">{project.projectName}</span>
        <span className="text-muted-foreground"> — {project.summary}</span>
      </p>

      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
          <ShipIcon className="h-2.5 w-2.5" /> {project.shippingMode}
        </span>
        {project.orderType === "Re-order" && (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
            <Repeat className="h-2.5 w-2.5" /> Re-order
          </span>
        )}
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-border/60">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarDays className="h-3.5 w-3.5" />
          <span className="font-medium text-foreground/80">{project.deadline}</span>
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
  );
};
