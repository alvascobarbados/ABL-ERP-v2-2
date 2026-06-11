import { describe, it, expect } from "vitest";
import { fmtTimeInStage } from "@/lib/timeInStage";

describe("fmtTimeInStage — calendar-day semantics", () => {
  it("null → '—'", () => {
    expect(fmtTimeInStage(null, new Date(2026, 5, 11, 12, 0))).toBe("—");
  });
  it("undefined → '—'", () => {
    expect(fmtTimeInStage(undefined, new Date(2026, 5, 11, 12, 0))).toBe("—");
  });
  it("same calendar day (9 AM → 5 PM) → '0d'", () => {
    const since = new Date(2026, 5, 11, 9, 0);
    const now = new Date(2026, 5, 11, 17, 0);
    expect(fmtTimeInStage(since, now)).toBe("0d");
  });
  it("11:55 PM yesterday → 12:05 AM today = '1d'", () => {
    const since = new Date(2026, 5, 10, 23, 55);
    const now = new Date(2026, 5, 11, 0, 5);
    expect(fmtTimeInStage(since, now)).toBe("1d");
  });
  it("47h ago spanning two midnights → '2d'", () => {
    const now = new Date(2026, 5, 11, 10, 0);
    const since = new Date(now.getTime() - 47 * 60 * 60_000);
    expect(fmtTimeInStage(since, now)).toBe("2d");
  });
  it("365 calendar days ago → '365d'", () => {
    const now = new Date(2026, 5, 11, 12, 0);
    const since = new Date(2025, 5, 11, 12, 0);
    expect(fmtTimeInStage(since, now)).toBe("365d");
  });
  it("future since (clock skew) → '0d'", () => {
    const now = new Date(2026, 5, 11, 12, 0);
    const since = new Date(2026, 5, 12, 12, 0);
    expect(fmtTimeInStage(since, now)).toBe("0d");
  });
});
