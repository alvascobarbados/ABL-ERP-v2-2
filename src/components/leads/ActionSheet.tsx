import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

export interface ActionItem {
  id: string;
  label: string;
  icon?: LucideIcon;
  onClick?: () => void;
  destructive?: boolean;
  disabled?: boolean;
  hint?: string;
}

interface ActionSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  items: ActionItem[];
}

export const ActionSheet = ({ open, onClose, title, items }: ActionSheetProps) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center sm:justify-center">
      <div className="absolute inset-0 bg-foreground/30 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div
        className="relative w-full sm:max-w-md bg-background rounded-t-3xl sm:rounded-2xl border-t sm:border shadow-2xl"
        style={{ borderColor: "hsl(var(--brand-navy) / 0.15)", animation: "slide-up 220ms ease-out" }}
      >
        {title && (
          <div className="px-5 pt-4 pb-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium">
            {title}
          </div>
        )}
        <ul className="py-1">
          {items.map((it) => {
            const Icon = it.icon;
            return (
              <li key={it.id}>
                <button
                  onClick={() => { if (it.disabled) return; it.onClick?.(); }}
                  disabled={it.disabled}
                  className={cn(
                    "w-full text-left px-5 py-3.5 flex items-center gap-3 transition-colors",
                    it.disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-muted/40",
                  )}
                  style={{ minHeight: 48, color: it.destructive ? "hsl(var(--urgent))" : undefined }}
                >
                  {Icon && <Icon className="h-4 w-4 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{it.label}</div>
                    {it.hint && <div className="text-xs text-muted-foreground mt-0.5">{it.hint}</div>}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="px-5 py-2 border-t border-border/60">
          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl text-sm font-medium hover:bg-muted/40 transition-colors"
            style={{ minHeight: 48, color: "hsl(var(--brand-navy))" }}
          >
            Cancel
          </button>
        </div>
        <style>{`@keyframes slide-up { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
      </div>
    </div>
  );
};
