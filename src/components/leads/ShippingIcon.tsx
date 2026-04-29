import { Plane, Ship, Package } from "lucide-react";
import { ShippingMode } from "@/data/pipelines";
import { cn } from "@/lib/utils";

interface Props {
  mode: ShippingMode;
  showLabel?: boolean;
  className?: string;
}

/**
 * Coloured shipping mode glyph.
 * Air = orange filled plane. Ocean LCL = navy outlined box. Ocean FCL = navy filled container.
 */
export const ShippingIcon = ({ mode, showLabel, className }: Props) => {
  if (mode === "Air") {
    return (
      <span className={cn("inline-flex items-center gap-1", className)} title="Air / DHL">
        <Plane className="h-3.5 w-3.5" style={{ color: "hsl(var(--brand-orange))" }} />
        {showLabel && <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Air</span>}
      </span>
    );
  }
  if (mode === "Ocean LCL") {
    return (
      <span className={cn("inline-flex items-center gap-1", className)} title="Ocean LCL">
        <Ship className="h-3.5 w-3.5" style={{ color: "hsl(var(--brand-navy))" }} />
        {showLabel && <span className="text-[10px] uppercase tracking-wider text-muted-foreground">LCL</span>}
      </span>
    );
  }
  // Ocean FCL — filled
  return (
    <span className={cn("inline-flex items-center gap-1", className)} title="Ocean FCL">
      <span
        className="inline-flex items-center justify-center h-4 w-4 rounded-[3px] text-white"
        style={{ backgroundColor: "hsl(var(--brand-navy))" }}
      >
        <Package className="h-2.5 w-2.5" strokeWidth={2.5} />
      </span>
      {showLabel && <span className="text-[10px] uppercase tracking-wider text-muted-foreground">FCL</span>}
    </span>
  );
};
