import { describe, it, expect } from "vitest";
import { formatAmountRounded, formatAmountFull } from "@/lib/money";

describe("formatAmountRounded", () => {
  it("null → '—'", () => {
    expect(formatAmountRounded(null)).toBe("—");
  });
  it("undefined → '—'", () => {
    expect(formatAmountRounded(undefined)).toBe("—");
  });
  it("non-finite (NaN) → '—'", () => {
    expect(formatAmountRounded(NaN)).toBe("—");
  });
  it("non-finite (Infinity) → '—'", () => {
    expect(formatAmountRounded(Infinity)).toBe("—");
  });
  it("0 → '$0'", () => {
    expect(formatAmountRounded(0)).toBe("$0");
  });
  it("rounds to nearest whole (half-up)", () => {
    expect(formatAmountRounded(5066.65)).toBe("$5,067");
    expect(formatAmountRounded(5066.49)).toBe("$5,066");
  });
  it("adds thousand separator", () => {
    expect(formatAmountRounded(1234567)).toBe("$1,234,567");
  });
  it("no currency suffix appended", () => {
    expect(formatAmountRounded(100)).toBe("$100");
  });
});

describe("formatAmountFull", () => {
  it("null/undefined → '—'", () => {
    expect(formatAmountFull(null)).toBe("—");
    expect(formatAmountFull(undefined)).toBe("—");
  });
  it("0 → '$0.00'", () => {
    expect(formatAmountFull(0)).toBe("$0.00");
  });
  it("two-decimal precision retained", () => {
    expect(formatAmountFull(5066.65)).toBe("$5,066.65");
  });
  it("rounds to 2dp at boundary", () => {
    expect(formatAmountFull(5066.659)).toBe("$5,066.66");
  });
  it("integer value gets trailing .00", () => {
    expect(formatAmountFull(100)).toBe("$100.00");
  });
});
