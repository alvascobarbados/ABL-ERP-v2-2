/**
 * Non-dismissable warning shown at 55 min idle, with a live countdown
 * until automatic sign-out at 60 min. Click outside is intentionally ignored.
 */
import { useEffect } from "react";

interface Props {
  open: boolean;
  remainingMs: number;
  onStay: () => void;
  onSignOut: () => void;
}

const fmt = (ms: number): string => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

export const IdleWarningModal = ({ open, remainingMs, onStay, onSignOut }: Props) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") { e.preventDefault(); onStay(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onStay]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-4"
      style={{ backgroundColor: "rgba(15, 23, 42, 0.55)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="idle-warning-title"
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white shadow-2xl p-6"
        style={{ border: "1px solid hsl(var(--brand-navy) / 0.18)" }}
      >
        <h2
          id="idle-warning-title"
          className="text-[20px] font-medium"
          style={{ color: "hsl(var(--brand-navy))" }}
        >
          Still there?
        </h2>
        <p className="mt-2 text-[14px] text-muted-foreground leading-snug">
          You've been inactive for 55 minutes. You'll be signed out in 5 minutes
          for security.
        </p>
        <p
          className="mt-4 text-[13px] tabular-nums"
          style={{ color: "hsl(var(--brand-navy) / 0.75)" }}
          aria-live="polite"
        >
          Signing out in <span style={{ fontWeight: 600 }}>{fmt(remainingMs)}</span>
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            onClick={onStay}
            className="w-full inline-flex items-center justify-center rounded-xl px-4 py-3 text-[14px] font-medium text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: "hsl(var(--brand-navy))", minHeight: 44 }}
          >
            Stay signed in
          </button>
          <button
            onClick={onSignOut}
            className="w-full inline-flex items-center justify-center rounded-xl px-4 py-3 text-[14px] font-medium border transition-colors hover:bg-muted/40"
            style={{ borderColor: "hsl(var(--brand-navy) / 0.2)", color: "hsl(var(--brand-navy))", minHeight: 44 }}
          >
            Sign out now
          </button>
        </div>
      </div>
    </div>
  );
};
