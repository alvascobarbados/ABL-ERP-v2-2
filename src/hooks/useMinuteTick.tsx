/**
 * Returns a value that changes every 60s so components that display
 * relative durations (e.g. "Current Stage" column) re-render and roll
 * over from "59m" → "1h" without a page refresh.
 */
import { useEffect, useState } from "react";

export function useMinuteTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return tick;
}
