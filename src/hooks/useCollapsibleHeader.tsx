import { useEffect, useRef, useState } from "react";

/**
 * Scroll-linked collapsible header progress.
 *
 * Returns an offset in pixels from 0 (fully visible) to `collapseDistance`
 * (fully collapsed). The offset is a continuous function of window.scrollY,
 * so the consumer can bind transform/opacity directly to the user's scroll
 * gesture — no state-transition snap.
 */
export function useCollapsibleHeader(opts?: {
  /** Pixel distance over which the brand row collapses. Default 56. */
  collapseDistance?: number;
  /** When true, freeze offset (e.g. while a modal/picker is open). */
  frozen?: boolean;
}) {
  const collapseDistance = opts?.collapseDistance ?? 56;
  const frozen = opts?.frozen ?? false;

  const [offset, setOffset] = useState(0);
  const ticking = useRef(false);
  const frozenRef = useRef(frozen);
  frozenRef.current = frozen;

  useEffect(() => {
    const compute = () => {
      ticking.current = false;
      if (frozenRef.current) return;
      const y = Math.max(0, window.scrollY || window.pageYOffset || 0);
      const next = Math.min(y, collapseDistance);
      setOffset((prev) => (prev === next ? prev : next));
    };

    const onScroll = () => {
      if (ticking.current) return;
      ticking.current = true;
      requestAnimationFrame(compute);
    };

    // Initialize from current scroll position
    compute();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [collapseDistance]);

  const progress = collapseDistance > 0 ? offset / collapseDistance : 0;
  return { offset, progress, collapseDistance };
}
