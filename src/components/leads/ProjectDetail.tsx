import { ArrowLeft, MoreVertical, Factory } from "lucide-react";
import { PipelineCard, PIPELINES, getShipment } from "@/data/pipelines";
import { PIPELINE_ACCENT } from "@/lib/brand";
import { useEffect } from "react";
import { cn } from "@/lib/utils";

interface Props {
  card: PipelineCard | null;
  onClose: () => void;
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
  const proj = card.project;
  const u = getUrgency(card.deadlineDate);

  const ship = getShipment(proj.shipmentId);
  let shipmentLine: string;
  if (ship) {
    shipmentLine = `${ship.mode} · ${ship.code}`;
  } else if (proj.shippingMode) {
    shipmentLine = `${proj.shippingMode} · Awaiting shipment`;
  } else {
    shipmentLine = "Awaiting shipment";
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-foreground/30 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <aside className="w-full max-w-2xl bg-background border-l border-border shadow-2xl overflow-y-auto animate-slide-in-right">
        {/* Top bar: back + customer + ⋮ */}
        <div className="sticky top-0 z-10 bg-background/90 backdrop-blur-md border-b border-border px-5 py-3 flex items-center justify-between">
          <button
            onClick={onClose}
            className="inline-flex items-center gap-2 text-sm font-semibold tracking-tight hover:opacity-80 transition-opacity"
            style={{ color: "hsl(var(--brand-navy))" }}
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="truncate max-w-[60vw]">{proj.customer}</span>
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
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-2">
            {proj.pointPerson}
          </div>
          <h1
            className="font-display text-3xl sm:text-4xl tracking-tight leading-tight mb-1.5"
            style={{ color: "hsl(var(--brand-navy))", letterSpacing: "-0.01em" }}
          >
            {proj.customer}
          </h1>
          <p
            className="text-[18px] sm:text-[19px] font-medium leading-snug mb-1.5"
            style={{ color: "hsl(var(--brand-navy))" }}
          >
            {proj.projectName}
          </p>
          {proj.detailSummary && (
            <p className="text-[15px] text-muted-foreground leading-relaxed mb-5">
              {proj.detailSummary}
            </p>
          )}

          {/* Reference row */}
          <dl className="space-y-1.5 text-[13px] mt-4">
            <Row label="Deadline">
              <span className="font-medium text-foreground tabular">
                {proj.deadline}
                <span className="text-muted-foreground/40 mx-2">·</span>
                <span className="font-semibold" style={{ color: u.color }}>{u.label}</span>
              </span>
            </Row>
            <Row label="Quote">
              <span className={cn("tabular", !proj.quoteNumber && "text-muted-foreground/50 italic")}>
                {proj.quoteNumber ?? "Q-"}
              </span>
            </Row>
            <Row label="PO">
              <span className={cn("tabular", !proj.poNumber && "text-muted-foreground/50 italic")}>
                {proj.poNumber ?? "PO-"}
              </span>
            </Row>
            {proj.invoiceNumber && <Row label="Invoice"><span className="tabular">{proj.invoiceNumber}</span></Row>}
            <Row label="Stage">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: accentHex }} />
                {pipeline.title} · {pipeline.stages.find((s) => s.id === card.stage)?.title}
              </span>
            </Row>
          </dl>
        </header>

        {/* Supplier & shipping block */}
        <section className="px-6 sm:px-8 pt-6 pb-2">
          <h2 className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-3">
            Supplier &amp; Shipping
          </h2>
          {card.supplier ? (
            <div className="rounded-2xl border border-border/60 bg-muted/30 p-5 sm:p-6">
              <div className="text-[16px] font-semibold tracking-tight text-foreground mb-1">
                {card.supplier.name}
              </div>
              <div className="text-[13px] text-muted-foreground/85 mb-1.5">
                {ship ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); onOpenShipment(ship.id); }}
                    className="hover:underline"
                  >
                    {shipmentLine}
                  </button>
                ) : (
                  <span>{shipmentLine}</span>
                )}
              </div>
              {proj.poNumber && (
                <div className="text-[13px] text-muted-foreground/75 tabular">{proj.poNumber}</div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground italic">
              No supplier assigned yet — pick one before moving past Confirming.
            </div>
          )}
        </section>

        {/* Line Items */}
        <section className="px-6 sm:px-8 pt-7 pb-2">
          <h2 className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-3">
            Line Items
          </h2>
          {!proj.lineItems || proj.lineItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground italic">
              No line items yet — these get added when the project enters Production.
            </div>
          ) : (() => {
            const maxDigits = Math.max(...proj.lineItems.map((li) => li.qty.toLocaleString().length), 3);
            return (
              <ul className="space-y-2.5">
                {proj.lineItems.map((li, i) => (
                  <li key={i} className="flex items-baseline gap-4 text-[15px]">
                    <span
                      className="text-right tabular font-semibold text-foreground shrink-0"
                      style={{ width: `${maxDigits + 1}ch` }}
                    >
                      {li.qty.toLocaleString()}
                    </span>
                    <span className="text-muted-foreground/60">×</span>
                    <span className="text-foreground/90 leading-snug">{li.description}</span>
                  </li>
                ))}
              </ul>
            );
          })()}
        </section>

        {/* Notes & History */}
        <section className="px-6 sm:px-8 pt-7 pb-2">
          <h2 className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-3">
            Notes &amp; History
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

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex gap-3">
    <dt className="w-20 shrink-0 text-muted-foreground/70 uppercase tracking-wider text-[10px] pt-0.5 font-medium">{label}</dt>
    <dd className="font-medium text-foreground">{children}</dd>
  </div>
);
