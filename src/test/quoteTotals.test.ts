import { describe, it, expect } from "vitest";
import { dedupedQuoteTotal, distinctQuoteCount } from "@/lib/quoteTotals";

describe("dedupedQuoteTotal", () => {
  it("empty array → 0", () => {
    expect(dedupedQuoteTotal([])).toBe(0);
  });

  it("two rows same quote, same amount → counted once", () => {
    expect(
      dedupedQuoteTotal([
        { quoteNumber: "Q-1", value: 1000 },
        { quoteNumber: "Q-1", value: 1000 },
      ]),
    ).toBe(1000);
  });

  it("two rows same quote, divergent amounts (0 and 29070) → 29070 (max wins)", () => {
    expect(
      dedupedQuoteTotal([
        { quoteNumber: "Q-3878", value: 0 },
        { quoteNumber: "Q-3878", value: 29070 },
      ]),
    ).toBe(29070);
  });

  it("rows without quoteNumber → each counted individually", () => {
    expect(
      dedupedQuoteTotal([
        { quoteNumber: null, value: 100 },
        { quoteNumber: undefined, value: 250 },
        { value: 50 },
      ]),
    ).toBe(400);
  });

  it("mixed: 2-row quote + 1-row quote + 1 no-quote row", () => {
    expect(
      dedupedQuoteTotal([
        { quoteNumber: "Q-A", value: 1000 },
        { quoteNumber: "Q-A", value: 1000 },
        { quoteNumber: "Q-B", value: 500 },
        { quoteNumber: null, value: 75 },
      ]),
    ).toBe(1575);
  });
});

describe("distinctQuoteCount", () => {
  it("counts distinct quoteNumbers, ignores unquoted", () => {
    expect(
      distinctQuoteCount([
        { quoteNumber: "Q-A" },
        { quoteNumber: "Q-A" },
        { quoteNumber: "Q-B" },
        { quoteNumber: null },
        { quoteNumber: undefined },
      ]),
    ).toBe(2);
  });

  it("empty → 0", () => {
    expect(distinctQuoteCount([])).toBe(0);
  });
});
