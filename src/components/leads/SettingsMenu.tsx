import { useEffect, useRef, useState } from "react";
import { Settings, RotateCcw, Columns3 } from "lucide-react";
import { toast } from "sonner";
import { useFriendlyMode } from "@/hooks/useFriendlyMode";
import { useExpandedCards } from "@/hooks/useExpandedCards";
import { useColumnWidths } from "@/hooks/useColumnWidths";

export const SettingsMenu = () => {
  const { resetWalkthrough } = useFriendlyMode();
  const { expandAll, setExpandAll } = useExpandedCards();
  const { reset: resetColumnWidths } = useColumnWidths();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const handleToggle = (v: boolean) => {
    setExpandAll(v);
    toast.success(
      v
        ? "Expanded cards on — line items shown by default"
        : "Expanded cards off — cards collapsed by default",
      { duration: 4000 },
    );
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Settings"
        className="inline-flex items-center justify-center rounded-full border bg-card/60 hover:bg-card transition-colors"
        style={{
          borderColor: "hsl(var(--brand-navy) / 0.25)",
          color: "hsl(var(--brand-navy))",
          width: 36, height: 36,
        }}
      >
        <Settings className="h-4 w-4" />
      </button>
      {open && (
        <div
          className="absolute right-0 mt-2 w-80 rounded-2xl bg-card border shadow-[var(--shadow-section)] p-4 z-40 animate-fade-in"
          style={{ borderColor: "hsl(var(--brand-navy) / 0.2)" }}
        >
          <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-medium mb-3">Display</p>
          <label className="flex items-start gap-3 cursor-pointer">
            <button
              type="button"
              role="switch"
              aria-checked={expandAll}
              onClick={() => handleToggle(!expandAll)}
              className="shrink-0 relative inline-flex items-center rounded-full transition-colors"
              style={{
                width: 44, height: 26,
                backgroundColor: expandAll ? "hsl(var(--brand-orange))" : "hsl(var(--muted-foreground) / 0.4)",
              }}
            >
              <span
                className="inline-block bg-white rounded-full shadow transition-transform"
                style={{
                  width: 20, height: 20,
                  transform: `translateX(${expandAll ? 22 : 2}px)`,
                }}
              />
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium" style={{ color: "hsl(var(--brand-navy))" }}>Expanded Cards</p>
              <p className="text-xs leading-snug mt-0.5" style={{ color: "hsl(var(--brand-navy) / 0.65)" }}>
                Show line items by default on every card. Tap individual chevrons to override.
              </p>
            </div>
          </label>
          <button
            onClick={() => { resetWalkthrough(); setOpen(false); }}
            className="mt-4 w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-medium hover:bg-muted/40 transition-colors"
            style={{ borderColor: "hsl(var(--brand-navy) / 0.25)", color: "hsl(var(--brand-navy))", minHeight: 44 }}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Replay welcome walkthrough
          </button>
        </div>
      )}
    </div>
  );
};
