/**
 * Routed Shipments page — wraps ShipmentsView in DesktopAppShell so the rail
 * persists. Existing shipment-detail flow uses ShipmentView via setSelected.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { DesktopAppShell } from "@/components/leads/DesktopAppShell";
import { ShipmentsView } from "@/components/leads/ShipmentsView";
import { ShipmentView } from "@/components/leads/ShipmentView";
import { usePipelineStore } from "@/hooks/useStageStore";
import type { Shipment } from "@/data/stages";

export default function ShipmentsPage() {
  const navigate = useNavigate();
  const { shipments, projects } = usePipelineStore();
  const [selected, setSelected] = useState<Shipment | null>(null);

  return (
    <DesktopAppShell>
      <ShipmentsView
        open
        onClose={() => navigate("/")}
        shipments={shipments}
        projects={projects}
        onOpenShipment={(id) => setSelected(shipments.find((s) => s.id === id) ?? null)}
      />
      <ShipmentView
        shipment={selected}
        onClose={() => setSelected(null)}
        onOpenProject={(id) => navigate(`/?project=${encodeURIComponent(id)}`)}
      />
    </DesktopAppShell>
  );
}
