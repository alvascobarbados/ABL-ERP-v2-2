import { describe, it, expect } from "vitest";
import { fmtTimeInStage } from "@/lib/timeInStage";

describe("fmtTimeInStage", () => {
  const now = new Date("2026-06-11T12:00:00Z");

  it("null → '—'", () => {
    expect(fmtTimeInStage(null, now)).toBe("—");
  });
  it("undefined → '—'", () => {
    expect(fmtTimeInStage(undefined, now)).toBe("—");
  });
  it("same moment → '0d'", () => {
    expect(fmtTimeInStage(now, now)).toBe("0d");
  });
  it("23h59m elapsed → '0d'", () => {
    const since = new Date(now.getTime() - (23 * 60 + 59) * 60_000);
    expect(fmtTimeInStage(since, now)).toBe("0d");
  });
  it("24h01m elapsed → '1d'", () => {
    const since = new Date(now.getTime() - (24 * 60 + 1) * 60_000);
    expect(fmtTimeInStage(since, now)).toBe("1d");
  });
  it("18 days elapsed → '18d'", () => {
    const since = new Date(now.getTime() - 18 * 86_400_000);
    expect(fmtTimeInStage(since, now)).toBe("18d");
  });
  it("365 days elapsed → '365d'", () => {
    const since = new Date(now.getTime() - 365 * 86_400_000);
    expect(fmtTimeInStage(since, now)).toBe("365d");
  });
  it("since in the future (clock skew) → '0d'", () => {
    const since = new Date(now.getTime() + 86_400_000);
    expect(fmtTimeInStage(since, now)).toBe("0d");
  });
});
