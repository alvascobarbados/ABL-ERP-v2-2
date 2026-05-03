import { useMemo } from "react";
import { Plane, Ship } from "lucide-react";
import { Sheet } from "./Sheet";
import { Shipment, Project, formatShipmentTitle } from "@/data/states";
import { STAGE_ACCENT } from "@/lib/brand";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  shipments: Shipment[];
  projects: Project[];
  onOpenShipment: (id: string) => void;
}

const STATUS_COLOR: Record<Shipment["status"], string> = {
  Booked: "hsl(var(--muted-foreground))",
  "In Transit": STAGE_ACCENT.shipping.hex,
  Customs: "hsl(var(--brand-orange))",
  Delayed: "hsl(var(--brand-orange))",
  Delivered: "hsl(142 71% 45%)",
};

export const ShipmentsView = ({ open, onClose, shipments, projects, onOpenShipment }: Props) => {
  const grouped = useMemo(() => {
    const air = shipments.filter((s) => s.mode === "Air");
    const ocean = shipments.filter((s) => s.mode !== "Air");
    return { air, ocean };
  }, [shipments]);

  if (!open) return null;

  const renderGroup = (title: "Air" | "Ocean", list: Shipment[]) => {
    const Icon = title === "Air" ? Plane : Ship;
    return (
      <section>
        <div className="flex items-center gap-2 mb-2">
          <Icon className="h-4 w-4" style={{ color: STAGE_ACCENT.shipping.hex }} />
          <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "hsl(var(--brand-navy))" }}>
            {title}
          </h3>
          <span className="text-xs text-muted-foreground">({list.length})</span>
        </div>
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground italic py-2 mb-4">No {title.toLowerCase()} shipments.</p>
        ) : (
          <div className="space-y-2 mb-5">
            {list.map((sh) => {
              const cargo = projects.filter((p) => p.shipmentId === sh.id);
              return (
                <button
                  key={sh.id}
                  onClick={() => { onClose(); onOpenShipment(sh.id); }}
                  className="w-full text-left rounded-xl border bg-card/60 hover:bg-card transition-colors px-3.5 py-3"
                  style={{ borderColor: "hsl(var(--brand-navy) / 0.15)", minHeight: 64 }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: "hsl(var(--brand-navy))" }}>
                        {formatShipmentTitle(sh)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        ETD {sh.etd.toLocaleDateString("en-US", { day: "numeric", month: "short" })} · ETA {sh.eta.toLocaleDateString("en-US", { day: "numeric", month: "short" })} · {cargo.length} item{cargo.length === 1 ? "" : "s"}
                      </p>
                    </div>
                    <span
                      className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full text-white whitespace-nowrap")}
                      style={{ backgroundColor: STATUS_COLOR[sh.status] }}
                    >
                      {sh.status}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>
    );
  };

  return (
    <Sheet open onClose={onClose} width="max-w-xl" eyebrow="Logistics" title="All shipments">
      {renderGroup("Air", grouped.air)}
      {renderGroup("Ocean", grouped.ocean)}
    </Sheet>
  );
};
