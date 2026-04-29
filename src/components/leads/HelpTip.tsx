import { useState, useRef, useEffect } from "react";
import { HelpCircle, X } from "lucide-react";
import { useFriendlyMode } from "@/hooks/useFriendlyMode";

interface HelpTipProps {
  text: string;
  label?: string;
  className?: string;
}

export const HelpTip = ({ text, label = "Help", className }: HelpTipProps) => {
  const { friendly } = useFriendlyMode();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [open]);

  if (!friendly) return null;

  return (
    <div ref={ref} className={"relative inline-flex " + (className ?? "")}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        aria-label={label}
        className="inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
        style={{ width: 28, height: 28 }}
      >
        <HelpCircle className="h-4 w-4" />
      </button>
      {open && (
        <div
          className="absolute z-30 top-full mt-2 left-0 w-72 rounded-xl bg-card border shadow-[var(--shadow-section)] p-3 text-sm leading-snug animate-fade-in"
          style={{ borderColor: "hsl(var(--brand-navy) / 0.2)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start gap-2">
            <p className="text-foreground/90 flex-1">{text}</p>
            <button
              onClick={() => setOpen(false)}
              className="shrink-0 p-1 rounded-md hover:bg-muted/60 text-muted-foreground"
              aria-label="Close help"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
