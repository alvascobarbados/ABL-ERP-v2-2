import { X, CalendarDays, User2, Building2, Tag, Plane, Ship, Repeat, Sparkles } from "lucide-react";
import { Project, PIPELINES, STAGE_ACCENT } from "@/data/pipelines";
import { cn } from "@/lib/utils";
import { useEffect } from "react";

interface Props {
  project: Project | null;
  onClose: () => void;
}

const accentBgClass: Record<string, string> = {
  indigo: "bg-stage-indigo", amber: "bg-stage-amber", emerald: "bg-stage-emerald",
  rose: "bg-stage-rose", slate: "bg-stage-slate", violet: "bg-stage-violet",
  orange: "bg-stage-orange", teal: "bg-stage-teal", sky: "bg-stage-sky",
  cyan: "bg-stage-cyan", fuchsia: "bg-stage-fuchsia",
};

export const ProjectDetail = ({ project, onClose }: Props) => {
  useEffect(() => {
    if (!project) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [project, onClose]);

  if (!project) return null;

  const pipeline = PIPELINES.find((p) => p.id === project.pipeline)!;
  const stage = pipeline.stages.find((s) => s.id === project.stage)!;
  const accent = STAGE_ACCENT[project.stage];
  const ShipIcon = project.shippingMode === "Air" ? Plane : Ship;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-foreground/30 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <aside className="w-full max-w-md bg-background border-l border-border shadow-2xl overflow-y-auto animate-slide-in-right">
        <div className="sticky top-0 bg-background/90 backdrop-blur-md border-b border-border px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={cn("w-2 h-2 rounded-full", accentBgClass[accent])} />
            <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
              {pipeline.title} · {stage.title}
            </span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div>
            <h2 className="font-serif-display text-3xl font-semibold tracking-tight mb-1">
              {project.customer}
            </h2>
            <p className="text-base text-foreground/80">
              <span className="font-medium">{project.projectName}</span>
              <span className="text-muted-foreground"> — {project.summary}</span>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <DetailRow icon={User2} label="Point person" value={project.pointPerson} />
            <DetailRow icon={Building2} label="Customer" value={project.customer} />
            <DetailRow icon={CalendarDays} label="Deadline" value={project.deadline} />
            <DetailRow icon={ShipIcon} label="Shipping" value={project.shippingMode} />
            <DetailRow icon={Repeat} label="Order type" value={project.orderType} />
            <DetailRow icon={Sparkles} label="Priority" value={project.priority} />
          </div>

          <div className="pt-4 border-t border-border">
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-3 flex items-center gap-1.5">
              <Tag className="h-3 w-3" /> Notes
            </p>
            <p className="text-sm text-muted-foreground italic">
              Project detail and timeline will appear here. Tap and hold a card to move it between stages.
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
};

const DetailRow = ({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) => (
  <div className="bg-card border border-border/60 rounded-xl p-3">
    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">
      <Icon className="h-3 w-3" />
      {label}
    </div>
    <div className="text-sm font-medium text-foreground">{value}</div>
  </div>
);
