/**
 * Placeholder sub-mode shipment pages (FCL/LCL/DHL/AF).
 *
 * Slice 1 of the spreadsheet rollout: rail expansion only — the actual
 * mode-specific tables ship in the next slice once the shipment schema
 * carries a sub-mode field. For now these render a friendly "coming soon"
 * card inside the standard DesktopAppShell so the rail stays visible.
 */
import { useNavigate, useParams } from "react-router-dom";
import { Construction } from "lucide-react";
import { DesktopAppShell } from "@/components/leads/DesktopAppShell";

const TITLES: Record<string, { title: string; sub: string }> = {
  fcl: { title: "FCL shipments", sub: "Sea freight · full container" },
  lcl: { title: "LCL shipments", sub: "Sea freight · shared container" },
  dhl: { title: "DHL shipments", sub: "Courier express" },
  af:  { title: "AF shipments",  sub: "Air freight consolidated"      },
};

export default function ShipmentsModePage() {
  const { mode = "" } = useParams();
  const navigate = useNavigate();
  const meta = TITLES[mode.toLowerCase()] ?? { title: "Shipments", sub: "" };

  return (
    <DesktopAppShell>
      <div
        className="h-full lg:h-screen flex flex-col"
        style={{ backgroundColor: "hsl(var(--background))" }}
      >
        <header
          className="shrink-0 border-b px-6 pt-6 pb-4"
          style={{ borderColor: "hsl(var(--brand-navy) / 0.12)" }}
        >
          <h1
            className="text-[22px] leading-tight tracking-tight"
            style={{ color: "hsl(var(--brand-navy))", fontWeight: 600 }}
          >
            {meta.title}
          </h1>
          <p className="mt-0.5 text-[14px]" style={{ color: "hsl(var(--brand-navy) / 0.6)" }}>
            {meta.sub}
          </p>
        </header>

        <div className="flex-1 flex items-center justify-center p-8">
          <div
            className="max-w-md w-full rounded-2xl border bg-card p-8 text-center"
            style={{ borderColor: "hsl(var(--brand-navy) / 0.15)" }}
          >
            <Construction
              className="h-8 w-8 mx-auto mb-3"
              style={{ color: "hsl(var(--brand-orange))" }}
            />
            <h2
              className="text-[16px] mb-1"
              style={{ color: "hsl(var(--brand-navy))", fontWeight: 600 }}
            >
              Coming soon
            </h2>
            <p className="text-[13px] leading-relaxed" style={{ color: "hsl(var(--brand-navy) / 0.65)" }}>
              The {meta.title.toLowerCase()} table lands in the next slice — once the shipment
              schema carries a sub-mode field. For now, all shipments live under{" "}
              <button
                onClick={() => navigate("/shipments")}
                className="underline font-medium"
                style={{ color: "hsl(var(--brand-orange))" }}
              >
                All shipments
              </button>.
            </p>
          </div>
        </div>
      </div>
    </DesktopAppShell>
  );
}
