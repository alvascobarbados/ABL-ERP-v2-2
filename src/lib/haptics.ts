// Centralized haptic feedback. All calls are feature-detected and silently
// no-op on browsers / devices that don't support the Vibration API.
//
// Important caveats:
//  • iOS Safari does NOT implement navigator.vibrate at all. There is no
//    web API for haptics on iPhone — this is a platform limitation, not a
//    bug we can fix in JS.
//  • Chrome / Android requires that vibrate() be called inside a user-
//    activation context (touchstart, click, pointerdown handler, or a
//    setTimeout descended from one while the gesture is still active).
//    Calling it from a stale setTimeout / rAF / async callback is silently
//    dropped.
//  • Some Android browsers also require an initial "unlock" vibrate() call
//    inside a real touch handler before later programmatic ones work. We
//    install that unlocker on first pointerdown.

type Pattern = number | number[];

const supported = typeof navigator !== "undefined" && "vibrate" in navigator;
let unlocked = false;
let loggedSupport = false;

function logSupportOnce() {
  if (loggedSupport) return;
  loggedSupport = true;
  if (typeof console !== "undefined") {
    if (!supported) {
      // eslint-disable-next-line no-console
      console.info(
        "[haptics] navigator.vibrate is not supported in this browser " +
          "(this is normal on iOS Safari — there is no web haptic API on iPhone).",
      );
    } else {
      // eslint-disable-next-line no-console
      console.info("[haptics] navigator.vibrate available — haptics enabled.");
    }
  }
}

function vibrate(pattern: Pattern) {
  logSupportOnce();
  if (!supported) return;
  try {
    const ok = navigator.vibrate(pattern);
    if (!ok && typeof console !== "undefined") {
      // eslint-disable-next-line no-console
      console.debug("[haptics] vibrate() returned false — likely outside a user-activation context or blocked by the browser.");
    }
  } catch {
    /* no-op */
  }
}

/** Install a one-time vibration "unlock" on the first real user touch.
 *  Some Android browsers require an initial vibrate() inside a direct
 *  touchstart/pointerdown to enable subsequent programmatic calls. */
export function installHapticsUnlock() {
  if (typeof window === "undefined") return;
  if (!supported) {
    logSupportOnce();
    return;
  }
  const handler = () => {
    if (unlocked) return;
    unlocked = true;
    try {
      // 0ms ping — enough to satisfy the user-activation requirement
      // without producing a perceptible buzz.
      navigator.vibrate(0);
    } catch {
      /* no-op */
    }
    window.removeEventListener("pointerdown", handler, true);
    window.removeEventListener("touchstart", handler, true);
  };
  window.addEventListener("pointerdown", handler, { capture: true, passive: true });
  window.addEventListener("touchstart", handler, { capture: true, passive: true });
}

export const haptics = {
  /** Long-press activates jiggle mode — single short pulse. */
  pickup: () => vibrate(15),
  /** State commit (chip tap or successful swipe) — slightly stronger pulse. */
  commit: () => vibrate(25),
  /** Swipe threshold crossed while dragging. */
  threshold: () => vibrate(10),
  /** Move blocked / invalid action — double-tick "nope". */
  nope: () => vibrate([10, 60, 10]),
  /** Save / commit changes (general) — rolling pattern. */
  save: () => vibrate([15, 30, 15]),
};
