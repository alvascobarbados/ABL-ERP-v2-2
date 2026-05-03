import { Sheet } from "./Sheet";
import { STATES, StageId, StateId } from "@/data/states";
import { getNextStage, getPrevStage, getStageTitle } from "@/hooks/useStageStore";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

interface StatePickerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  current: { state: StageId; state: StateId } | null;
  onPick: (target: { state: StageId; state: StateId }) => void;
}

export const StatePicker = ({ open, onClose, title, subtitle, current, onPick }: StatePickerProps) => {
  const next = current ? getNextStage(current.state, current.state) : null;
  const prev = current ? getPrevStage(current.state, current.state) : null;
  const isAdjacent = (p: StageId, s: StateId) =>
    (next && next.state === p && next.state === s) || (prev && prev.state === p && prev.state === s);

  return (
    <Sheet open={open} onClose={onClose} title="Move project">
      <div className="space-y-1 pb-3 border-b border-border/60">
        <p className="text-xl font-semibold tracking-tight" style={{ color: "hsl(var(--brand-navy))" }}>{title}</p>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>

      <div className="space-y-5 mt-4">
        {STATES.map((p) => {
          // Shipping has exactly one user-facing state ("Shipping"). Mode
          // (Air/Ocean/Local) is changed elsewhere — never via the picker.
          const states = p.id === "shipping"
            ? [{ id: "shipment_required" as StateId, title: "Shipping" }]
            : p.states;
          return (
            <div key={p.id}>
              <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-medium mb-2">
                {p.title}
              </p>
              <div className="grid grid-cols-1 gap-1.5">
                {states.map((s) => {
                  const isCurrent = current?.state === p.id && (
                    p.id === "shipping" ? true : current?.state === s.id
                  );
                  const adj = isAdjacent(p.id, s.id);
                  return (
                    <button
                      key={s.id}
                      onClick={() => !isCurrent && onPick({ state: p.id, state: s.id })}
                      disabled={isCurrent}
                      className={cn(
                        "w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-left transition-[var(--transition-smooth)]",
                        isCurrent
                          ? "cursor-default"
                          : adj
                            ? "bg-card hover:bg-muted/40 font-medium"
                            : "bg-card/60 border-border/60 hover:bg-muted/40",
                      )}
                      style={
                        isCurrent
                          ? { backgroundColor: "hsl(var(--brand-navy) / 0.06)", borderColor: "hsl(var(--brand-navy) / 0.4)", boxShadow: "0 0 0 1px hsl(var(--brand-navy) / 0.25)" }
                          : adj
                            ? { borderColor: "hsl(var(--brand-navy) / 0.35)" }
                            : undefined
                      }
                    >
                      <span className="text-sm text-foreground">{s.title}</span>
                      {isCurrent ? (
                        <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                          <Check className="h-3 w-3" /> Current
                        </span>
                      ) : adj ? (
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          {next?.state === p.id && next?.state === s.id ? "Next" : "Prev"}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="pt-4 mt-4 border-t border-border/60">
        <button
          onClick={onClose}
          className="w-full px-4 py-2.5 rounded-xl bg-muted hover:bg-muted/70 text-foreground text-sm font-medium transition-[var(--transition-smooth)]"
        >
          Close
        </button>
      </div>
    </Sheet>
  );
};
