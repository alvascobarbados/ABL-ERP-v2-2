import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { PipelineId, StageId } from "@/data/pipelines";

const STORAGE_KEY = "alvasco.friendlyMode";
const DISMISS_PREFIX = "alvasco.tip.dismissed:";
const WALKTHROUGH_KEY = "alvasco.walkthrough.completed";

interface FriendlyModeCtx {
  friendly: boolean;
  setFriendly: (v: boolean) => void;
  toggle: () => void;
  isTipDismissed: (id: string) => boolean;
  dismissTip: (id: string) => void;
  walkthroughDone: boolean;
  completeWalkthrough: () => void;
  resetWalkthrough: () => void;
}

const Ctx = createContext<FriendlyModeCtx | null>(null);

export const FriendlyModeProvider = ({ children }: { children: ReactNode }) => {
  const [friendly, setFriendlyState] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return true; // default ON
    return raw === "true";
  });
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    const all = new Set<string>();
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(DISMISS_PREFIX)) all.add(k.slice(DISMISS_PREFIX.length));
    }
    return all;
  });
  const [walkthroughDone, setWalkthroughDone] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem(WALKTHROUGH_KEY) === "true";
  });

  useEffect(() => {
    const root = document.documentElement;
    if (friendly) root.classList.add("friendly"); else root.classList.remove("friendly");
  }, [friendly]);

  const setFriendly = useCallback((v: boolean) => {
    setFriendlyState(v);
    localStorage.setItem(STORAGE_KEY, String(v));
  }, []);
  const toggle = useCallback(() => setFriendly(!friendly), [friendly, setFriendly]);

  const isTipDismissed = useCallback((id: string) => dismissed.has(id), [dismissed]);
  const dismissTip = useCallback((id: string) => {
    localStorage.setItem(DISMISS_PREFIX + id, "true");
    setDismissed((prev) => new Set(prev).add(id));
  }, []);
  const completeWalkthrough = useCallback(() => {
    localStorage.setItem(WALKTHROUGH_KEY, "true");
    setWalkthroughDone(true);
  }, []);
  const resetWalkthrough = useCallback(() => {
    localStorage.removeItem(WALKTHROUGH_KEY);
    setWalkthroughDone(false);
  }, []);

  const value = useMemo<FriendlyModeCtx>(
    () => ({ friendly, setFriendly, toggle, isTipDismissed, dismissTip, walkthroughDone, completeWalkthrough, resetWalkthrough }),
    [friendly, setFriendly, toggle, isTipDismissed, dismissTip, walkthroughDone, completeWalkthrough, resetWalkthrough],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useFriendlyMode = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useFriendlyMode must be used inside FriendlyModeProvider");
  return ctx;
};

// ─── Plain-language labels ───
export const FRIENDLY_STAGE_LABELS: Record<StageId, string> = {
  proposal: "Proposal — needs writing",
  quote: "Quote — needs pricing",
  confirming: "Waiting for customer to confirm",
  cold: "Cold — no recent activity",
  lost: "Lost — closed",
  artwork: "Artwork — being designed",
  production: "Production — being made",
  ready: "Ready to ship to customer",
  booking: "Booking — arranging shipment",
  transit: "In transit — on the way",
  customs: "At customs / clearance",
  delivered: "Delivered to customer",
  invoiced: "Invoiced — waiting for payment",
  paid: "Paid — complete",
};

export const FRIENDLY_PIPELINE_SUBTITLES: Record<PipelineId, string> = {
  sales: "Getting new business",
  production: "Making the goods",
  shipping: "Getting goods to customer",
  finance: "Getting paid",
};

export const FRIENDLY_STAGE_HELP: Record<StageId, string> = {
  proposal: "New enquiries that need a written proposal. Once you've sent the proposal, move forward to Quote.",
  quote: "Projects that need pricing worked out and sent to the customer. Once you've sent the quote, move forward to Confirming.",
  confirming: "Quote sent. Waiting for the customer to say yes. When they confirm, move forward to start Production.",
  cold: "No recent activity from the customer. Follow up or move back to Quote when they respond.",
  lost: "Customer didn't go ahead. You can move it back later if it comes back to life.",
  artwork: "Designs being prepared. Move forward when artwork is approved and the supplier can start making it.",
  production: "Goods are being manufactured by the supplier. Move forward when production is finished.",
  ready: "Goods are made and ready to be shipped. Move forward to start Booking the shipment.",
  booking: "Arranging the shipment with the freight forwarder. Move forward once the cargo is on its way.",
  transit: "Cargo is in transit. Move forward when it arrives at customs.",
  customs: "Cargo is going through customs clearance. Move forward when it's released for delivery.",
  delivered: "Goods have reached the customer. Move forward to invoice.",
  invoiced: "Invoice has been sent. Move forward when the customer pays.",
  paid: "Project is complete and paid. 🎉",
};
