import { useEffect } from "react";
import { GitMerge } from "lucide-react";

interface MergeDialogProps {
  open: boolean;
  title: string;
  /** Body lines — rendered as bullet points (use plain strings). */
  bullets: string[];
  intro?: string;
  footer?: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}

/**
 * Confirmation modal for merge actions (Customer-into-Customer and
 * Buyer-with-Buyer). Visually distinct from the generic ConfirmDialog —
 * uses a merge icon, larger body, and a destructive confirm button.
 */
export const MergeDialog = ({
  open, title, intro, bullets, footer, confirmLabel, onConfirm, onCancel, busy,
}: MergeDialogProps) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel, busy]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={busy ? undefined : onCancel} />
      <div
        className="relative w-full max-w-lg rounded-2xl bg-card shadow-[var(--shadow-section)] border p-5 sm:p-6 animate-fade-in"
        style={{ borderColor: "hsl(var(--brand-navy) / 0.2)" }}
      >
        <div className="flex items-start gap-3 mb-3">
          <div
            className="shrink-0 inline-flex items-center justify-center rounded-full"
            style={{
              width: 40, height: 40,
              backgroundColor: "hsl(var(--brand-orange) / 0.12)",
              color: "hsl(var(--brand-orange))",
            }}
          >
            <GitMerge className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold tracking-tight" style={{ color: "hsl(var(--brand-navy))" }}>
              {title}
            </h3>
          </div>
        </div>

        <div className="text-sm text-foreground/85 leading-relaxed space-y-3">
          {intro && <p>{intro}</p>}
          <ul className="list-disc pl-5 space-y-1.5">
            {bullets.map((b, i) => <li key={i}>{b}</li>)}
          </ul>
          {footer && <p className="text-foreground/70 italic">{footer}</p>}
        </div>

        <div className="mt-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2.5 rounded-xl border text-sm font-medium hover:bg-muted/40 transition-colors disabled:opacity-50"
            style={{ borderColor: "hsl(var(--brand-navy) / 0.3)", color: "hsl(var(--brand-navy))", minHeight: 48 }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-50"
            style={{ backgroundColor: "hsl(var(--urgent))", minHeight: 48 }}
          >
            {busy ? "Merging…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
