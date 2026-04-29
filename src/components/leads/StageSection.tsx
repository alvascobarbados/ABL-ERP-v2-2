import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Lead, LeadStage } from "./leadsData";
import { LeadCard } from "./LeadCard";
import { cn } from "@/lib/utils";

interface StageSectionProps {
  title: string;
  stage: LeadStage;
  leads: Lead[];
}

const stageBar: Record<LeadStage, string> = {
  proposal: "bg-stage-proposal",
  quotation: "bg-stage-quotation",
  pending: "bg-stage-pending",
};

export const StageSection = ({ title, stage, leads }: StageSectionProps) => {
  const [open, setOpen] = useState(true);

  return (
    <section className="bg-card rounded-2xl shadow-[var(--shadow-section)] border border-border/60 overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between p-5 sm:p-6 hover:bg-muted/40 transition-[var(--transition-smooth)]"
        aria-expanded={open}
      >
        <div className="flex items-center gap-3">
          <span className={cn("w-1.5 h-7 rounded-full", stageBar[stage])} />
          <h2 className="text-lg sm:text-xl font-semibold text-foreground">{title}</h2>
          <span className="text-sm text-muted-foreground font-medium">
            {leads.length} {leads.length === 1 ? "Lead" : "Leads"}
          </span>
        </div>
        <ChevronDown
          className={cn(
            "h-5 w-5 text-muted-foreground transition-transform duration-300",
            open ? "rotate-0" : "-rotate-90",
          )}
        />
      </button>

      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="px-5 pb-5 sm:px-6 sm:pb-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {leads.map((lead) => (
              <LeadCard key={lead.id} lead={lead} stage={stage} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
