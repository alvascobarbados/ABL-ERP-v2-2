import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

interface DeleteConfirmDialogProps {
  open: boolean;
  label: string; // e.g. "Customer · Project"
  onCancel: () => void;
  onConfirm: () => void;
}

/** Destructive confirmation requiring the user to type DELETE. */
export const DeleteConfirmDialog = ({ open, label, onCancel, onConfirm }: DeleteConfirmDialogProps) => {
  const [v, setV] = useState("");
  useEffect(() => { if (open) setV(""); }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);
  if (!open) return null;
  const ok = v.trim().toUpperCase() === "DELETE";
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={onCancel} />
      <div
        className="relative w-full max-w-md rounded-2xl bg-card shadow-[var(--shadow-section)] border p-5 sm:p-6 animate-fade-in"
        style={{ borderColor: "hsl(var(--urgent) / 0.3)" }}
      >
        <div className="flex items-start gap-3 mb-3">
          <div
            className="shrink-0 inline-flex items-center justify-center rounded-full"
            style={{
              width: 40, height: 40,
              backgroundColor: "hsl(var(--urgent) / 0.12)",
              color: "hsl(var(--urgent))",
            }}
          >
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold tracking-tight" style={{ color: "hsl(var(--brand-navy))" }}>
              Delete project?
            </h3>
            <p className="mt-1 text-sm text-foreground/80 leading-snug">
              This will permanently delete <span className="font-semibold">{label}</span>. This cannot be undone.
            </p>
          </div>
        </div>

        <label className="block text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-1.5 mt-2">
          Type <span className="font-bold text-foreground tracking-wider">DELETE</span> to confirm
        </label>
        <input
          autoFocus
          value={v}
          onChange={(e) => setV(e.target.value)}
          className="w-full rounded-xl border bg-background px-3 py-2.5 text-[15px] tracking-wider focus:outline-none focus:ring-2 focus:ring-[hsl(var(--urgent)/0.3)]"
          style={{ minHeight: 48, borderColor: "hsl(var(--urgent) / 0.3)" }}
        />

        <div className="mt-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2.5 rounded-xl border text-sm font-medium hover:bg-muted/40 transition-colors"
            style={{ borderColor: "hsl(var(--brand-navy) / 0.3)", color: "hsl(var(--brand-navy))", minHeight: 48 }}
          >
            Cancel
          </button>
          <button
            onClick={() => ok && onConfirm()}
            disabled={!ok}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-40"
            style={{ backgroundColor: "hsl(var(--urgent))", minHeight: 48 }}
          >
            Delete permanently
          </button>
        </div>
      </div>
    </div>
  );
};
