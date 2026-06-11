import { describe, it, expect } from "vitest";
import {
  paymentTermsDays,
  formatPaymentTerms,
  computeDueDate,
  addDays,
  pendingInvoiceAging,
  dueAging,
} from "@/lib/paymentTerms";

describe("paymentTermsDays", () => {
  it("maps each Net term to its day count", () => {
    expect(paymentTermsDays("Net 7")).toBe(7);
    expect(paymentTermsDays("Net 15")).toBe(15);
    expect(paymentTermsDays("Net 30")).toBe(30);
    expect(paymentTermsDays("Net 60")).toBe(60);
    expect(paymentTermsDays("Net 90")).toBe(90);
  });
  it("Due on Receipt → 0", () => {
    expect(paymentTermsDays("Due on Receipt")).toBe(0);
  });
  it("Custom uses customDays, clamped at 0", () => {
    expect(paymentTermsDays("Custom", 14)).toBe(14);
    expect(paymentTermsDays("Custom", 0)).toBe(0);
    expect(paymentTermsDays("Custom", -5)).toBe(0);
    expect(paymentTermsDays("Custom", null)).toBe(0);
    expect(paymentTermsDays("Custom")).toBe(0);
  });
  it("unknown / null / undefined → default 30", () => {
    expect(paymentTermsDays(null)).toBe(30);
    expect(paymentTermsDays(undefined)).toBe(30);
  });
});

describe("formatPaymentTerms", () => {
  it("non-custom returns label verbatim", () => {
    expect(formatPaymentTerms("Net 30")).toBe("Net 30");
    expect(formatPaymentTerms("Due on Receipt")).toBe("Due on Receipt");
  });
  it("custom appends (custom) marker", () => {
    expect(formatPaymentTerms("Custom", 14)).toBe("Net 14 (custom)");
    expect(formatPaymentTerms("Custom", -3)).toBe("Net 0 (custom)");
    expect(formatPaymentTerms("Custom", null)).toBe("Net 0 (custom)");
  });
  it("null/undefined → 'Net 30' default", () => {
    expect(formatPaymentTerms(null)).toBe("Net 30");
    expect(formatPaymentTerms(undefined)).toBe("Net 30");
  });
});

describe("computeDueDate", () => {
  it("undefined invoice → undefined", () => {
    expect(computeDueDate(undefined, "Net 30")).toBeUndefined();
    expect(computeDueDate(null, "Net 30")).toBeUndefined();
  });
  it("Net 30: issued + 30 days", () => {
    const issued = new Date(2026, 0, 1);
    const due = computeDueDate(issued, "Net 30")!;
    expect(due.getTime()).toBe(addDays(issued, 30).getTime());
  });
  it("Custom uses custom days", () => {
    const issued = new Date(2026, 0, 1);
    const due = computeDueDate(issued, "Custom", 14)!;
    expect(due.getTime()).toBe(addDays(issued, 14).getTime());
  });
  it("Due on Receipt = same day (midnight)", () => {
    const issued = new Date(2026, 5, 10, 14, 30);
    const due = computeDueDate(issued, "Due on Receipt")!;
    expect(due.getFullYear()).toBe(2026);
    expect(due.getMonth()).toBe(5);
    expect(due.getDate()).toBe(10);
  });
});

describe("addDays", () => {
  it("adds N days, normalised to midnight", () => {
    const d = addDays(new Date(2026, 0, 1, 14, 30), 5);
    expect(d.getDate()).toBe(6);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
  });
  it("handles month rollover", () => {
    const d = addDays(new Date(2026, 0, 30), 5);
    expect(d.getMonth()).toBe(1); // Feb
    expect(d.getDate()).toBe(4);
  });
});

describe("pendingInvoiceAging", () => {
  it("no enteredAt → 'Pending invoice', calm", () => {
    expect(pendingInvoiceAging(null)).toEqual({ label: "Pending invoice", tone: "calm" });
  });
  it("0–6 days → calm", () => {
    const d = new Date(); d.setDate(d.getDate() - 3);
    expect(pendingInvoiceAging(d).tone).toBe("calm");
  });
  it("7–13 days → amber", () => {
    const d = new Date(); d.setDate(d.getDate() - 10);
    expect(pendingInvoiceAging(d).tone).toBe("amber");
  });
  it("14+ days → deep-red with amber border", () => {
    const d = new Date(); d.setDate(d.getDate() - 20);
    const r = pendingInvoiceAging(d);
    expect(r.tone).toBe("deep-red");
    expect(r.cardBorder).toBe("amber");
  });
});

describe("dueAging", () => {
  const inDays = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d;
  };
  it("no due → 'Due —', calm", () => {
    expect(dueAging(null)).toEqual({ label: "Due —", tone: "calm" });
  });
  it("> 7 days out → calm", () => {
    expect(dueAging(inDays(14)).tone).toBe("calm");
  });
  it("1–7 days out → amber", () => {
    expect(dueAging(inDays(3)).tone).toBe("amber");
  });
  it("today → 'Due today', amber", () => {
    expect(dueAging(inDays(0))).toEqual({ label: "Due today", tone: "amber" });
  });
  it("1–7 days overdue → soft-red", () => {
    expect(dueAging(inDays(-3)).tone).toBe("soft-red");
  });
  it("8–29 days overdue → med-red", () => {
    expect(dueAging(inDays(-15)).tone).toBe("med-red");
  });
  it("30+ days overdue → deep-red with red border", () => {
    const r = dueAging(inDays(-45));
    expect(r.tone).toBe("deep-red");
    expect(r.cardBorder).toBe("red");
  });
});
