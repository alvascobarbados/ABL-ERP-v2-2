import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  eyebrow?: React.ReactNode;
  children: React.ReactNode;
  width?: string;
}

export const Sheet = ({ open, onClose, title, eyebrow, children, width = "max-w-md" }: SheetProps) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-foreground/30 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <aside className={cn("w-full bg-background border-l border-border shadow-2xl overflow-y-auto animate-slide-in-right", width)}>
        <div className="sticky top-0 z-10 bg-background/90 backdrop-blur-md border-b border-border px-5 py-4 flex items-center justify-between">
          <div className="min-w-0">
            {eyebrow && (
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-0.5">
                {eyebrow}
              </div>
            )}
            <div className="font-serif-display text-lg font-semibold tracking-tight truncate">{title}</div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted transition-colors shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </aside>
    </div>
  );
};
