import { useState } from "react";
import { useFriendlyMode } from "@/hooks/useFriendlyMode";
import { Briefcase, Layers, MousePointer2, Sparkles } from "lucide-react";

const STEPS = [
  {
    icon: Sparkles,
    title: "Welcome to Alvasco",
    body: "This app helps you track every project from first enquiry to final payment.",
  },
  {
    icon: Layers,
    title: "Four pipelines",
    body: "Sales, Production, Shipping, Finance. Tap the tabs at the top, or swipe left and right, to move between them.",
  },
  {
    icon: MousePointer2,
    title: "Each card is a project",
    body: "Tap a card to see details, or use the Move Forward / Back buttons to advance it through stages.",
  },
  {
    icon: Briefcase,
    title: "That's it",
    body: "Tap the ? icon anywhere if you need help. You can turn off Friendly Mode in settings any time.",
  },
];

export const Walkthrough = () => {
  const { friendly, walkthroughDone, completeWalkthrough } = useFriendlyMode();
  const [step, setStep] = useState(0);

  if (!friendly || walkthroughDone) return null;
  const Step = STEPS[step];
  const last = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
      <div className="absolute inset-0" style={{ backgroundColor: "hsl(var(--brand-navy) / 0.85)" }} />
      <div className="relative w-full max-w-md rounded-3xl bg-card shadow-[var(--shadow-section)] p-6 sm:p-8 animate-fade-in">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-1.5">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className="h-1.5 rounded-full transition-all"
                style={{
                  width: i === step ? 24 : 8,
                  backgroundColor: i === step ? "hsl(var(--brand-orange))" : "hsl(var(--brand-navy) / 0.2)",
                }}
              />
            ))}
          </div>
          <button
            onClick={completeWalkthrough}
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Skip
          </button>
        </div>

        <div className="flex flex-col items-center text-center gap-4 mb-6">
          <div
            className="inline-flex items-center justify-center rounded-2xl"
            style={{ width: 72, height: 72, backgroundColor: "hsl(var(--brand-orange) / 0.12)", color: "hsl(var(--brand-orange))" }}
          >
            <Step.icon className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight" style={{ color: "hsl(var(--brand-navy))" }}>
            {Step.title}
          </h2>
          <p className="text-base text-foreground/80 leading-relaxed">{Step.body}</p>
        </div>

        <div className="flex items-center gap-2">
          {step > 0 && (
            <button
              onClick={() => setStep((s) => s - 1)}
              className="flex-1 px-4 py-3 rounded-xl border text-sm font-medium hover:bg-muted/40"
              style={{ borderColor: "hsl(var(--brand-navy) / 0.3)", color: "hsl(var(--brand-navy))", minHeight: 56 }}
            >
              Back
            </button>
          )}
          <button
            onClick={() => last ? completeWalkthrough() : setStep((s) => s + 1)}
            className="flex-1 px-4 py-3 rounded-xl text-base font-semibold text-white"
            style={{ backgroundColor: "hsl(var(--brand-orange))", minHeight: 56 }}
          >
            {last ? "Get started" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
};
