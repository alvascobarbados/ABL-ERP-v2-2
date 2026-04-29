import { useEffect, useRef, useState } from "react";
import { Settings, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useFriendlyMode } from "@/hooks/useFriendlyMode";

export const SettingsMenu = () => {
  const { friendly, setFriendly, resetWalkthrough } = useFriendlyMode();
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
    setFriendly(v);
    toast.success(
      v
        ? "Friendly Mode on — bigger buttons and clearer labels"
        : "Friendly Mode off — refined view",
      { duration: friendly ? 5000 : 7000 },
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
              aria-checked={friendly}
              onClick={() => handleToggle(!friendly)}
              className="shrink-0 relative inline-flex items-center rounded-full transition-colors"
              style={{
                width: 44, height: 26,
                backgroundColor: friendly ? "hsl(var(--brand-orange))" : "hsl(var(--muted-foreground) / 0.4)",
              }}
            >
              <span
                className="inline-block bg-white rounded-full shadow transition-transform"
                style={{
                  width: 20, height: 20,
                  transform: `translateX(${friendly ? 22 : 2}px)`,
                }}
              />
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium" style={{ color: "hsl(var(--brand-navy))" }}>Friendly Mode</p>
              <p className="text-xs text-muted-foreground leading-snug mt-0.5">
                Larger buttons, clearer labels, and on-screen guidance. Recommended for new users.
              </p>
            </div>
          </label>
          {friendly && (
            <button
              onClick={() => { resetWalkthrough(); setOpen(false); }}
              className="mt-4 w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-medium hover:bg-muted/40 transition-colors"
              style={{ borderColor: "hsl(var(--brand-navy) / 0.25)", color: "hsl(var(--brand-navy))", minHeight: 44 }}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Replay welcome walkthrough
            </button>
          )}
        </div>
      )}
    </div>
  );
};
