import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog = ({
  open, title, description,
  confirmLabel = "Yes", cancelLabel = "Cancel",
  destructive, onConfirm, onCancel,
}: ConfirmDialogProps) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={onCancel} />
      <div
        className="relative w-full max-w-md rounded-2xl bg-card shadow-[var(--shadow-section)] border p-5 sm:p-6 animate-fade-in"
        style={{ borderColor: "hsl(var(--brand-navy) / 0.2)" }}
      >
        <div className="flex items-start gap-3 mb-3">
          <div
            className="shrink-0 inline-flex items-center justify-center rounded-full"
            style={{
              width: 40, height: 40,
              backgroundColor: destructive ? "hsl(var(--urgent) / 0.12)" : "hsl(var(--brand-orange) / 0.12)",
              color: destructive ? "hsl(var(--urgent))" : "hsl(var(--brand-orange))",
            }}
          >
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold tracking-tight" style={{ color: "hsl(var(--brand-navy))" }}>{title}</h3>
            <p className="mt-1 text-sm text-foreground/80 leading-snug">{description}</p>
          </div>
        </div>
        <div className="mt-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2.5 rounded-xl border text-sm font-medium hover:bg-muted/40 transition-colors"
            style={{ borderColor: "hsl(var(--brand-navy) / 0.3)", color: "hsl(var(--brand-navy))", minHeight: 48 }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors"
            style={{
              backgroundColor: destructive ? "hsl(var(--urgent))" : "hsl(var(--brand-orange))",
              minHeight: 48,
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
