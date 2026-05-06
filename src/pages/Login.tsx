/**
 * Austere internal-team login. Wordmark, subtitle, Google button.
 */
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const GoogleG = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
    <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.17-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62z"/>
    <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/>
    <path fill="#FBBC05" d="M3.97 10.71A5.41 5.41 0 0 1 3.68 9c0-.59.1-1.17.29-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.04l3.01-2.33z"/>
    <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/>
  </svg>
);

export default function Login() {
  const [busy, setBusy] = useState(false);

  const onGoogle = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      toast.error(error.message);
      setBusy(false);
    }
  };

  return (
    <div
      className="min-h-dvh flex flex-col items-center justify-center px-6"
      style={{ backgroundColor: "hsl(var(--background))" }}
    >
      <div className="w-full max-w-sm flex flex-col items-center text-center">
        <span
          className="font-display text-[44px] leading-none tracking-tight"
          style={{ fontWeight: 600 }}
        >
          <span style={{ color: "hsl(var(--brand-navy))" }}>alvas</span>
          <span style={{ color: "hsl(var(--brand-orange))" }}>co</span>
        </span>
        <p className="mt-3 text-sm text-muted-foreground">Sign in to continue</p>

        <button
          onClick={onGoogle}
          disabled={busy}
          className="mt-8 w-full inline-flex items-center justify-center gap-3 rounded-xl bg-white border px-4 py-3 text-[14px] font-medium shadow-sm hover:bg-muted/30 transition-colors disabled:opacity-60"
          style={{ borderColor: "hsl(var(--brand-navy) / 0.2)", color: "hsl(var(--brand-navy))", minHeight: 48 }}
        >
          <GoogleG />
          {busy ? "Redirecting…" : "Sign in with Google"}
        </button>
      </div>
    </div>
  );
}
