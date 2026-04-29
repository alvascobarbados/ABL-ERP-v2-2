// Centralized haptic feedback. All calls are feature-detected and silently
// no-op on browsers / desktops that don't support the Vibration API.

type Pattern = number | number[];

function vibrate(pattern: Pattern) {
  if (typeof navigator === "undefined") return;
  if (!("vibrate" in navigator)) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* no-op */
  }
}

export const haptics = {
  /** Long-press activates jiggle mode — single short pulse. */
  pickup: () => vibrate(10),
  /** Stage commit (chip tap or successful swipe) — slightly stronger pulse. */
  commit: () => vibrate(20),
  /** Swipe threshold crossed while dragging. */
  threshold: () => vibrate(10),
  /** Move blocked / invalid action — double-tick "nope". */
  nope: () => vibrate([5, 50, 5]),
  /** Save / commit changes (general) — rolling pattern. */
  save: () => vibrate([15, 30, 15]),
};
