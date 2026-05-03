/**
 * Payment terms — shared helpers for Customer + Project records.
 *
 * Customers carry a default `paymentTerms`. Projects inherit at creation but
 * can override per-project. Invoiced cards age against a computed dueDate
 * (invoiceIssuedDate + N days). Invoice Required cards age against
 * `invoiceRequiredEnteredAt`.
 */

export type PaymentTermsId =
  | "Net 7" | "Net 15" | "Net 30" | "Net 60" | "Net 90"
  | "Due on Receipt" | "Custom";

export const PAYMENT_TERMS_OPTIONS: PaymentTermsId[] = [
  "Net 7", "Net 15", "Net 30", "Net 60", "Net 90", "Due on Receipt", "Custom",
];

export const DEFAULT_PAYMENT_TERMS: PaymentTermsId = "Net 30";

export function paymentTermsDays(
  terms: PaymentTermsId | undefined | null,
  customDays?: number | null,
): number {
  switch (terms) {
    case "Net 7": return 7;
    case "Net 15": return 15;
    case "Net 30": return 30;
    case "Net 60": return 60;
    case "Net 90": return 90;
    case "Due on Receipt": return 0;
    case "Custom": return Math.max(0, customDays ?? 0);
    default: return 30;
  }
}

export function formatPaymentTerms(
  terms: PaymentTermsId | undefined | null,
  customDays?: number | null,
): string {
  if (terms === "Custom") return `Net ${Math.max(0, customDays ?? 0)} (custom)`;
  return terms ?? DEFAULT_PAYMENT_TERMS;
}

const DAY = 86400000;

export function addDays(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function computeDueDate(
  invoiceIssuedDate: Date | undefined | null,
  terms: PaymentTermsId | undefined | null,
  customDays?: number | null,
): Date | undefined {
  if (!invoiceIssuedDate) return undefined;
  return addDays(invoiceIssuedDate, paymentTermsDays(terms, customDays));
}

export interface AgingState {
  /** Plain text label e.g. "Due in 4d", "Due 3d ago", "Due today" */
  label: string;
  /** Colour bucket — caller maps to specific colour. */
  tone: "calm" | "amber" | "soft-red" | "med-red" | "deep-red";
  /** Whether the card should get a subtle full-card border treatment. */
  cardBorder?: "amber" | "red";
}

const today = () => startOfDay(new Date());

/** Aging for a card sitting in finance/invoice_required. */
export function pendingInvoiceAging(
  enteredAt: Date | undefined | null,
): AgingState {
  if (!enteredAt) return { label: "Pending invoice", tone: "calm" };
  const days = Math.max(0, Math.round((today().getTime() - startOfDay(enteredAt).getTime()) / DAY));
  if (days <= 6) return { label: `Pending invoice ${days}d`, tone: "calm" };
  if (days <= 13) return { label: `Pending invoice ${days}d`, tone: "amber" };
  return { label: `Pending invoice ${days}d`, tone: "deep-red", cardBorder: "amber" };
}

/** Aging for a card sitting in finance/invoiced. */
export function dueAging(due: Date | undefined | null): AgingState {
  if (!due) return { label: "Due —", tone: "calm" };
  const diff = Math.round((startOfDay(due).getTime() - today().getTime()) / DAY);
  if (diff > 7) return { label: `Due in ${diff}d`, tone: "calm" };
  if (diff > 0) return { label: `Due in ${diff}d`, tone: "amber" };
  if (diff === 0) return { label: "Due today", tone: "amber" };
  const overdue = Math.abs(diff);
  if (overdue <= 7) return { label: `Due ${overdue}d ago`, tone: "soft-red" };
  if (overdue <= 29) return { label: `Due ${overdue}d ago`, tone: "med-red" };
  return { label: `Due ${overdue}d ago`, tone: "deep-red", cardBorder: "red" };
}

export function agingHex(tone: AgingState["tone"]): string {
  switch (tone) {
    case "calm":     return "hsl(var(--brand-navy) / 0.70)";
    case "amber":    return "hsl(var(--brand-orange))";
    case "soft-red": return "hsl(0 65% 60%)";
    case "med-red":  return "hsl(0 70% 50%)";
    case "deep-red": return "hsl(var(--urgent))";
  }
}

// Sage green wash used by the Paid column.
export const PAID_GREEN_HEX = "#6B8E5A";
export const PAID_GREEN_WASH = "rgba(107, 142, 90, 0.10)";
export const PAID_GREEN_BADGE = "rgba(107, 142, 90, 0.18)";
