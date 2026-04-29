import { ArrowLeft, MoreVertical } from "lucide-react";
import {
  PipelineCard, PIPELINES, getSubsForMaster, getSupplier, getShipment,
  getQuoteNumber, getInvoiceNumber, SubProject,
} from "@/data/pipelines";
import { PIPELINE_ACCENT } from "@/lib/brand";
import { useEffect } from "react";
import { cn } from "@/lib/utils";

interface Props {
  card: PipelineCard | null;
  onClose: () => void;
  onOpenMaster: (id: string) => void;
  onOpenShipment: (id: string) => void;
  onAdvance?: (card: PipelineCard) => void;
  onOpenPicker?: (card: PipelineCard) => void;
}

const TODAY = new Date(2026, 4, 8);
function getUrgency(date: Date) {
  const diff = Math.ceil((date.getTime() - TODAY.getTime()) / 86400000);
  if (diff < 0) return { label: `${Math.abs(diff)}d overdue`, color: "hsl(var(--urgent))" };
  if (diff <= 7)  return { label: `in ${diff}d`,             color: "hsl(var(--urgent))" };
  if (diff <= 14) return { label: `in ${diff}d`,             color: "hsl(var(--brand-orange))" };
  return { label: `in ${diff}d`, color: "hsl(var(--muted-foreground))" };
}

function shipmentLabel(sub: SubProject): string {
  const ship = getShipment(sub.shipmentId);
  if (ship) {
    const modePrefix = ship.mode === "Air" ? "Air" : ship.mode; // "Ocean LCL" / "Ocean FCL" / "Air"
    return `${modePrefix} · ${ship.code}`;
  }
  if (sub.pipeline === "shipping" && sub.stage === "shipment_required") return "Awaiting shipment";
  return sub.shippingMode;
}

interface SupplierGroup {
  supplierId: string;
  supplierName: string;
  subs: SubProject[];
}

function groupBySupplier(subs: SubProject[]): SupplierGroup[] {
  const map = new Map<string, SupplierGroup>();
  for (const s of subs) {
    const sup = getSupplier(s.supplierId);
    const name = sup?.name ?? "Unknown supplier";
    if (!map.has(s.supplierId)) {
      map.set(s.supplierId, { supplierId: s.supplierId, supplierName: name, subs: [] });
    }
    map.get(s.supplierId)!.subs.push(s);
  }
  return Array.from(map.values());
}

export const ProjectDetail = ({ card, onClose, onOpenShipment, onAdvance, onOpenPicker }: Props) => {
  useEffect(() => {
    if (!card) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [card, onClose]);

  if (!card) return null;
  const pipeline = PIPELINES.find((p) => p.id === card.pipeline)!;
  const accentHex = PIPELINE_ACCENT[card.pipeline].hex;
  const master = card.master;
  const u = getUrgency(card.deadlineDate);

  const subs = getSubsForMaster(master.id);
  // If we have subs at all, show all of them grouped by supplier (the master's full picture).
  // If we don't (master is still in Sales), show an empty state.
  const supplierGroups = groupBySupplier(subs);

  const quote = getQuoteNumber(master.id);
  const invoice = getInvoiceNumber(master.id);

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-foreground/30 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <aside className="w-full max-w-2xl bg-background border-l border-border shadow-2xl overflow-y-auto animate-slide-in-right">
        {/* Top bar: back arrow + customer + ⋮ */}
        <div className="sticky top-0 z-10 bg-background/90 backdrop-blur-md border-b border-border px-5 py-3 flex items-center justify-between">
          <button
            onClick={onClose}
            className="inline-flex items-center gap-2 text-sm font-semibold tracking-tight hover:opacity-80 transition-opacity"
            style={{ color: "hsl(var(--brand-navy))" }}
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="truncate max-w-[60vw]">{master.customer}</span>
          </button>
          <button
            onClick={() => onOpenPicker?.(card)}
            className="p-2 rounded-full text-muted-foreground/70 hover:text-foreground hover:bg-muted/60 transition-colors"
            aria-label="Project actions"
          >
            <MoreVertical className="h-5 w-5" />
          </button>
        </div>

        {/* Pipeline accent stripe */}
        <div className="h-[3px] w-full" style={{ backgroundColor: accentHex }} />

        {/* Header section */}
        <header className="px-6 sm:px-8 pt-6 pb-7 border-b border-border/60">
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-1">
            {master.pointPerson}
          </div>
          <h1
            className="font-display text-3xl sm:text-4xl tracking-tight leading-tight mb-2"
            style={{ color: "hsl(var(--brand-navy))", letterSpacing: "-0.01em" }}
          >
            {master.projectName}
          </h1>
          <p className="text-[15px] text-muted-foreground leading-relaxed mb-5">
            {master.summary}
          </p>

          {/* Reference row */}
          <dl className="space-y-1.5 text-[13px]">
            <div className="flex gap-3">
              <dt className="w-20 shrink-0 text-muted-foreground/70 uppercase tracking-wider text-[10px] pt-0.5 font-medium">Deadline</dt>
              <dd className="font-medium text-foreground tabular">
                {master.deadline}
                <span className="text-muted-foreground/40 mx-2">·</span>
                <span className="font-semibold" style={{ color: u.color }}>{u.label}</span>
              </dd>
            </div>
            {quote && (
              <div className="flex gap-3">
                <dt className="w-20 shrink-0 text-muted-foreground/70 uppercase tracking-wider text-[10px] pt-0.5 font-medium">Quote</dt>
                <dd className="font-medium text-foreground tabular">{quote}</dd>
              </div>
            )}
            {invoice && (
              <div className="flex gap-3">
                <dt className="w-20 shrink-0 text-muted-foreground/70 uppercase tracking-wider text-[10px] pt-0.5 font-medium">Invoice</dt>
                <dd className="font-medium text-foreground tabular">{invoice}</dd>
              </div>
            )}
            <div className="flex gap-3">
              <dt className="w-20 shrink-0 text-muted-foreground/70 uppercase tracking-wider text-[10px] pt-0.5 font-medium">Stage</dt>
              <dd className="font-medium text-foreground inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: accentHex }} />
                {pipeline.title} · {pipeline.stages.find((s) => s.id === card.stage)?.title}
              </dd>
            </div>
          </dl>
        </header>

        {/* Line Items */}
        <section className="px-6 sm:px-8 pt-6 pb-2">
          <h2 className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-3">
            Line Items
          </h2>

          {supplierGroups.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground italic">
              No line items yet — this project is still in Sales. Items get added when it splits to Production.
            </div>
          ) : (
            <div className="space-y-4">
              {supplierGroups.map((g) => {
                // Compute consistent qty column width across this project: longest qty across all items.
                const allQtys = supplierGroups.flatMap((x) => x.subs.flatMap((s) => s.lineItems ?? []).map((li) => li.qty));
                const maxQtyDigits = Math.max(...allQtys.map((q) => q.toLocaleString().length), 3);
                return (
                  <div
                    key={g.supplierId}
                    className="rounded-2xl border border-border/60 bg-muted/30 p-5 sm:p-6"
                  >
                    {/* Supplier card top row */}
                    <div className="flex items-baseline justify-between gap-3 mb-1">
                      <h3 className="text-[15px] font-semibold tracking-tight text-foreground">
                        {g.supplierName}
                      </h3>
                      <span className="text-[12px] text-muted-foreground/80 tabular shrink-0">
                        {g.subs.map((s) => s.poNumber).filter(Boolean).join(", ") || "—"}
                      </span>
                    </div>

                    {/* Shipment / mode line — one per sub if they differ */}
                    <div className="text-[12px] text-muted-foreground/80 mb-4 space-y-0.5">
                      {Array.from(new Set(g.subs.map(shipmentLabel))).map((label, i) => {
                        const ship = g.subs.find((s) => shipmentLabel(s) === label && s.shipmentId)?.shipmentId;
                        return (
                          <div key={i}>
                            {ship ? (
                              <button
                                onClick={(e) => { e.stopPropagation(); onOpenShipment(ship); }}
                                className="hover:underline"
                              >
                                {label}
                              </button>
                            ) : (
                              <span>{label}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Line items */}
                    <ul className="space-y-2">
                      {g.subs.flatMap((s) => (s.lineItems ?? [])).map((li, i) => (
                        <li key={i} className="flex items-baseline gap-4 text-[14px]">
                          <span
                            className="text-right tabular font-semibold text-foreground shrink-0"
                            style={{ width: `${maxQtyDigits + 1}ch` }}
                          >
                            {li.qty.toLocaleString()}
                          </span>
                          <span className="text-muted-foreground/60">×</span>
                          <span className="text-foreground/90 leading-snug">{li.description}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Notes & History */}
        <section className="px-6 sm:px-8 pt-7 pb-2">
          <h2 className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-3">
            Notes & History
          </h2>
          <div className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground italic">
            No notes yet
          </div>
        </section>

        {/* Action buttons */}
        <div className="px-6 sm:px-8 pt-6 pb-8 flex items-center gap-3">
          {onAdvance && (
            <button
              onClick={() => onAdvance(card)}
              className={cn(
                "flex-1 inline-flex items-center justify-center px-4 py-3 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
              )}
              style={{ backgroundColor: accentHex }}
            >
              Move to next stage
            </button>
          )}
          <button
            onClick={() => onOpenPicker?.(card)}
            className="px-4 py-3 rounded-xl text-sm font-semibold border bg-card hover:bg-muted/40 transition-colors"
            style={{ borderColor: "hsl(var(--brand-navy) / 0.3)", color: "hsl(var(--brand-navy))" }}
          >
            More actions
          </button>
        </div>
      </aside>
    </div>
  );
};
