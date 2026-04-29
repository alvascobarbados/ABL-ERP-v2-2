import { Sparkles, Repeat } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "rush" | "reorder" | "new";

interface Props {
  variant: Variant;
  className?: string;
}

export const StatusPill = ({ variant, className }: Props) => {
  if (variant === "rush") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full text-white",
          className,
        )}
        style={{ backgroundColor: "hsl(var(--brand-orange))" }}
      >
        <Sparkles className="h-2.5 w-2.5" /> Rush
      </span>
    );
  }
  if (variant === "reorder") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full text-white",
          className,
        )}
        style={{ backgroundColor: "hsl(var(--brand-navy-soft))" }}
      >
        <Repeat className="h-2.5 w-2.5" /> Re-order
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full bg-muted text-muted-foreground",
        className,
      )}
    >
      New
    </span>
  );
};

export const SupplierChip = ({ color, name, className }: { color: string; name?: string; className?: string }) => (
  <span className={cn("inline-flex items-center gap-1.5", className)}>
    <span
      className="inline-block h-2 w-2 rounded-[2px] shrink-0"
      style={{ backgroundColor: color }}
      aria-hidden
    />
    {name && <span className="text-xs text-muted-foreground truncate">{name}</span>}
  </span>
);
