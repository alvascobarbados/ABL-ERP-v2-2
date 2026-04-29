import { CalendarDays, User2 } from "lucide-react";
import { Lead, LeadStage } from "./leadsData";
import { cn } from "@/lib/utils";

interface LeadCardProps {
  lead: Lead;
  stage: LeadStage;
}

const stageAccent: Record<LeadStage, string> = {
  proposal: "before:bg-stage-proposal",
  quotation: "before:bg-stage-quotation",
  pending: "before:bg-stage-pending",
};

function getUrgency(date: Date): { label: string; className: string } | null {
  const now = new Date(2026, 4, 8); // pin "today" for demo
  const diff = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diff <= 3) return { label: "Urgent", className: "bg-urgent/10 text-urgent" };
  if (diff <= 7) return { label: "Soon", className: "bg-soon/10 text-soon" };
  return null;
}

export const LeadCard = ({ lead, stage }: LeadCardProps) => {
  const urgency = getUrgency(lead.deadlineDate);

  return (
    <article
      className={cn(
        "group relative overflow-hidden rounded-xl bg-card p-5 border border-border/60",
        "shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-section)]",
        "transition-[var(--transition-smooth)] hover:-translate-y-0.5",
        "before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1",
        stageAccent[stage],
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <h3 className="font-semibold text-foreground leading-tight">
          {lead.customer}
        </h3>
        {urgency && (
          <span className={cn("text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0", urgency.className)}>
            {urgency.label}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
        <User2 className="h-3 w-3" />
        <span>{lead.pointPerson}</span>
      </div>

      <p className="text-sm text-foreground/80 leading-snug mb-4">
        <span className="font-medium">{lead.projectName}</span>
        <span className="text-muted-foreground"> — {lead.summary}</span>
      </p>

      <div className="flex items-center justify-between pt-3 border-t border-border/60">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarDays className="h-3.5 w-3.5" />
          <span>Deadline</span>
        </div>
        <span className="text-sm font-semibold text-foreground tabular-nums">
          {lead.deadline}
        </span>
      </div>
    </article>
  );
};
