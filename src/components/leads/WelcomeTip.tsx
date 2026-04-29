import { X } from "lucide-react";
import { useFriendlyMode } from "@/hooks/useFriendlyMode";

interface WelcomeTipProps {
  id: string;
  text: string;
}

export const WelcomeTip = ({ id, text }: WelcomeTipProps) => {
  const { friendly, isTipDismissed, dismissTip } = useFriendlyMode();
  if (!friendly) return null;
  if (isTipDismissed(id)) return null;
  return (
    <div
      className="rounded-2xl border p-4 sm:p-5 flex items-start gap-3 animate-fade-in"
      style={{
        backgroundColor: "hsl(var(--brand-orange) / 0.08)",
        borderColor: "hsl(var(--brand-orange) / 0.35)",
      }}
    >
      <div className="flex-1 text-sm sm:text-[15px] leading-snug" style={{ color: "hsl(var(--brand-navy))" }}>
        {text}
      </div>
      <button
        onClick={() => dismissTip(id)}
        className="shrink-0 p-1.5 rounded-md hover:bg-white/60 text-muted-foreground"
        aria-label="Dismiss tip"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};
