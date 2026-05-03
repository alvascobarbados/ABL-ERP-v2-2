import { Plane, Ship, Truck } from "lucide-react";
import { ShippingMode } from "@/data/states";
import { cn } from "@/lib/utils";

interface Props {
  mode: ShippingMode;
  showLabel?: boolean;
  className?: string;
}

/**
 * Coloured shipping mode glyph for the new three-mode model.
 *  Air   = orange filled plane
 *  Ocean = navy ship
 *  Local = teal truck
 *
 * Container (FCL/LCL) and carrier (DHL/FedEx/Other) are encoded inside the
 * tracking reference and surfaced as text — they no longer have their own icons.
 */
export const ShippingIcon = ({ mode, showLabel, className }: Props) => {
  if (mode === "Air") {
    return (
      <span className={cn("inline-flex items-center gap-1", className)} title="Air">
        <Plane className="h-3.5 w-3.5" style={{ color: "hsl(var(--brand-orange))" }} />
        {showLabel && <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Air</span>}
      </span>
    );
  }
  if (mode === "Ocean") {
    return (
      <span className={cn("inline-flex items-center gap-1", className)} title="Ocean">
        <Ship className="h-3.5 w-3.5" style={{ color: "hsl(var(--brand-navy))" }} />
        {showLabel && <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Ocean</span>}
      </span>
    );
  }
  // Local
  return (
    <span className={cn("inline-flex items-center gap-1", className)} title="Local">
      <Truck className="h-3.5 w-3.5" style={{ color: "hsl(var(--brand-teal))" }} />
      {showLabel && <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Local</span>}
    </span>
  );
};
