import { useEffect, useRef, useState } from "react";

/**
 * Tracks scroll direction to drive a collapsible top "brand" row.
 *
 * - At rest (scrollY ≤ topThreshold): brand row visible.
 * - Scrolling down past `hideAfter`: brand row hides.
 * - Any upward scroll movement (> upDelta): brand row reveals immediately.
 * - Ignores iOS overscroll bounce (negative scrollY).
 */
export function useCollapsibleHeader(opts?: {
  hideAfter?: number;
  upDelta?: number;
  topThreshold?: number;
}) {
  const hideAfter = opts?.hideAfter ?? 60;
  const upDelta = opts?.upDelta ?? 4;
  const topThreshold = opts?.topThreshold ?? 8;

  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);
  const ticking = useRef(false);

  useEffect(() => {
    const onScroll = () => {
      if (ticking.current) return;
      ticking.current = true;
      requestAnimationFrame(() => {
        const y = Math.max(0, window.scrollY || window.pageYOffset || 0);
        const dy = y - lastY.current;

        if (y <= topThreshold) {
          setHidden(false);
        } else if (dy > 0 && y > hideAfter) {
          // Scrolling down past threshold → hide
          setHidden(true);
        } else if (dy < -upDelta) {
          // Any genuine upward intent → reveal
          setHidden(false);
        }

        lastY.current = y;
        ticking.current = false;
      });
    };

    lastY.current = Math.max(0, window.scrollY || 0);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [hideAfter, upDelta, topThreshold]);

  return hidden;
}
