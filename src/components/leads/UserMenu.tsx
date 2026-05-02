/**
 * Top-right user identity — avatar + first name. Tap opens popover with
 * Profile / Settings / Sign out. Settings (Friendly Mode toggle, replay
 * walkthrough) is reached from this popover instead of a standalone cog.
 */
import { useEffect, useRef, useState } from "react";
import { LogOut, User as UserIcon, Settings as SettingsIcon, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useFriendlyMode } from "@/hooks/useFriendlyMode";
import { cn } from "@/lib/utils";

const DEFAULT_USER = { fullName: "Avinash Vaswani", initials: "AV" };

export const UserMenu = () => {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"main" | "settings">("main");
  const ref = useRef<HTMLDivElement | null>(null);
  const { friendly, setFriendly, resetWalkthrough } = useFriendlyMode();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setView("main");
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const firstName = DEFAULT_USER.fullName.split(" ")[0];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="User menu"
        className="inline-flex items-center gap-2 rounded-full pl-1 pr-2.5 py-0.5 hover:bg-muted/40 transition-colors"
      >
        <span
          className="inline-flex items-center justify-center rounded-full text-[11px] font-semibold tracking-wide text-white"
          style={{
            width: 28, height: 28,
            background: "linear-gradient(135deg, hsl(var(--brand-navy)), hsl(var(--brand-orange)))",
          }}
        >
          {DEFAULT_USER.initials}
        </span>
        <span className="text-[13px] font-medium" style={{ color: "hsl(var(--brand-navy))" }}>
          {firstName}
        </span>
      </button>
      {open && (
        <div
          className="absolute right-0 mt-2 w-72 rounded-2xl bg-card border shadow-[var(--shadow-section)] z-40 animate-fade-in overflow-hidden"
          style={{ borderColor: "hsl(var(--brand-navy) / 0.2)" }}
        >
          {view === "main" ? (
            <>
              <div className="px-4 py-3 border-b border-border/60 flex items-center gap-3">
                <span
                  className="inline-flex items-center justify-center rounded-full text-[13px] font-semibold text-white"
                  style={{
                    width: 36, height: 36,
                    background: "linear-gradient(135deg, hsl(var(--brand-navy)), hsl(var(--brand-orange)))",
                  }}
                >
                  {DEFAULT_USER.initials}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: "hsl(var(--brand-navy))" }}>
                    {DEFAULT_USER.fullName}
                  </p>
                  <p className="text-[11px] text-muted-foreground">Operations team</p>
                </div>
              </div>
              <div className="p-1.5">
                <Row icon={UserIcon} label="Profile" onClick={() => { setOpen(false); toast("Profile coming soon"); }} />
                <Row icon={SettingsIcon} label="Settings" onClick={() => setView("settings")} />
                <div className="my-1 h-px bg-border/70" />
                <Row icon={LogOut} label="Sign out" destructive onClick={() => { setOpen(false); toast("Sign out coming soon"); }} />
              </div>
            </>
          ) : (
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <button onClick={() => setView("main")} className="text-xs text-muted-foreground hover:text-foreground">
                  ← Back
                </button>
                <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-medium">Display</p>
                <span className="w-8" />
              </div>
              <label className="flex items-start gap-3 cursor-pointer">
                <button
                  type="button"
                  role="switch"
                  aria-checked={friendly}
                  onClick={() => {
                    setFriendly(!friendly);
                    toast.success(!friendly ? "Friendly Mode on" : "Friendly Mode off");
                  }}
                  className="shrink-0 relative inline-flex items-center rounded-full transition-colors"
                  style={{
                    width: 44, height: 26,
                    backgroundColor: friendly ? "hsl(var(--brand-orange))" : "hsl(var(--muted-foreground) / 0.4)",
                  }}
                >
                  <span
                    className="inline-block bg-white rounded-full shadow transition-transform"
                    style={{ width: 20, height: 20, transform: `translateX(${friendly ? 22 : 2}px)` }}
                  />
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium" style={{ color: "hsl(var(--brand-navy))" }}>Friendly Mode</p>
                  <p className="text-xs text-muted-foreground leading-snug mt-0.5">
                    Larger buttons, clearer labels, on-screen guidance.
                  </p>
                </div>
              </label>
              {friendly && (
                <button
                  onClick={() => { resetWalkthrough(); setOpen(false); setView("main"); }}
                  className="mt-4 w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-medium hover:bg-muted/40 transition-colors"
                  style={{ borderColor: "hsl(var(--brand-navy) / 0.25)", color: "hsl(var(--brand-navy))", minHeight: 44 }}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Replay welcome walkthrough
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const Row = ({
  icon: Icon, label, onClick, destructive,
}: { icon: typeof LogOut; label: string; onClick: () => void; destructive?: boolean }) => (
  <button
    onClick={onClick}
    className={cn(
      "w-full flex items-center gap-3 px-3 py-2.5 text-[14px] text-left rounded-lg transition-colors hover:bg-muted/60",
      destructive ? "text-[hsl(var(--urgent))]/85 hover:text-[hsl(var(--urgent))]" : "text-foreground",
    )}
    style={{ minHeight: 40 }}
  >
    <Icon className="h-4 w-4 shrink-0 opacity-80" />
    <span className="font-medium">{label}</span>
  </button>
);

export const DEFAULT_USER_INITIALS = DEFAULT_USER.initials;
