/**
 * Auto-logout after 60 min of inactivity, with a 5-min warning modal.
 *
 * Activity events: mousedown, mousemove, keydown, scroll, touchstart, click.
 * Timer reset is debounced to once per second.
 * Tab focus/blur and background API responses do NOT count as activity.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export const IDLE_TIMEOUT_MS = 60 * 60 * 1000;
export const WARNING_BEFORE_MS = 5 * 60 * 1000;
const ACTIVITY_DEBOUNCE_MS = 1000;

const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  "mousedown", "mousemove", "keydown", "scroll", "touchstart", "click",
];

interface Options {
  enabled: boolean;
  onIdleLogout: () => void;
}

interface State {
  warningOpen: boolean;
  /** Ms remaining until logout (only meaningful when warningOpen). */
  remainingMs: number;
  dismissWarning: () => void;
  logoutNow: () => void;
}

export function useIdleTimeout({ enabled, onIdleLogout }: Options): State {
  const [warningOpen, setWarningOpen] = useState(false);
  const [remainingMs, setRemainingMs] = useState(WARNING_BEFORE_MS);

  const lastActivityAt = useRef<number>(Date.now());
  const lastResetAt = useRef<number>(0);
  const warningTimer = useRef<number | null>(null);
  const logoutTimer = useRef<number | null>(null);
  const countdownTimer = useRef<number | null>(null);
  const firedLogout = useRef(false);

  const clearAll = useCallback(() => {
    if (warningTimer.current !== null) { window.clearTimeout(warningTimer.current); warningTimer.current = null; }
    if (logoutTimer.current !== null) { window.clearTimeout(logoutTimer.current); logoutTimer.current = null; }
    if (countdownTimer.current !== null) { window.clearInterval(countdownTimer.current); countdownTimer.current = null; }
  }, []);

  const scheduleTimers = useCallback(() => {
    clearAll();
    warningTimer.current = window.setTimeout(() => {
      setRemainingMs(WARNING_BEFORE_MS);
      setWarningOpen(true);
      const deadline = Date.now() + WARNING_BEFORE_MS;
      countdownTimer.current = window.setInterval(() => {
        const r = Math.max(0, deadline - Date.now());
        setRemainingMs(r);
      }, 1000);
    }, IDLE_TIMEOUT_MS - WARNING_BEFORE_MS);

    logoutTimer.current = window.setTimeout(() => {
      if (firedLogout.current) return;
      firedLogout.current = true;
      clearAll();
      setWarningOpen(false);
      onIdleLogout();
    }, IDLE_TIMEOUT_MS);
  }, [clearAll, onIdleLogout]);

  const resetActivity = useCallback(() => {
    const now = Date.now();
    if (now - lastResetAt.current < ACTIVITY_DEBOUNCE_MS) return;
    lastResetAt.current = now;
    lastActivityAt.current = now;
    // If the warning was up, don't auto-dismiss on background mouse drift —
    // user must click a button. So skip reset while warning is open.
    if (warningOpen) return;
    scheduleTimers();
  }, [scheduleTimers, warningOpen]);

  const dismissWarning = useCallback(() => {
    setWarningOpen(false);
    lastActivityAt.current = Date.now();
    lastResetAt.current = Date.now();
    firedLogout.current = false;
    scheduleTimers();
  }, [scheduleTimers]);

  const logoutNow = useCallback(() => {
    if (firedLogout.current) return;
    firedLogout.current = true;
    clearAll();
    setWarningOpen(false);
    onIdleLogout();
  }, [clearAll, onIdleLogout]);

  useEffect(() => {
    if (!enabled) {
      clearAll();
      setWarningOpen(false);
      firedLogout.current = false;
      return;
    }
    firedLogout.current = false;
    scheduleTimers();
    const handler = () => resetActivity();
    ACTIVITY_EVENTS.forEach((evt) =>
      window.addEventListener(evt, handler, { passive: true } as AddEventListenerOptions),
    );
    return () => {
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, handler));
      clearAll();
    };
  }, [enabled, clearAll, scheduleTimers, resetActivity]);

  return { warningOpen, remainingMs, dismissWarning, logoutNow };
}
