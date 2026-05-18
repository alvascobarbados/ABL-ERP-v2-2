/**
 * Austere internal-team login. Wordmark, subtitle, Google + Magic Link.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { lovable } from "@/integrations/lovable";
import { supabase } from "@/integrations/supabase/client";

const GoogleG = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
    <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.17-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62z"/>
    <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/>
    <path fill="#FBBC05" d="M3.97 10.71A5.41 5.41 0 0 1 3.68 9c0-.59.1-1.17.29-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.04l3.01-2.33z"/>
    <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/>
  </svg>
);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const friendlyError = (msg?: string): string => {
  const m = (msg ?? "").toLowerCase();
  if (m.includes("rate") || m.includes("seconds") || m.includes("only request")) {
    return "Too many attempts. Wait a moment and try again.";
  }
  if (m.includes("disabled") || m.includes("not enabled") || m.includes("signups not allowed")) {
    return "Email sign-in is currently unavailable. Use Google or contact your admin.";
  }
  if (m.includes("network") || m.includes("fetch") || m.includes("failed to fetch")) {
    return "Connection error. Try again.";
  }
  return "Something went wrong. Try again.";
};

export default function Login() {
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [idleBanner, setIdleBanner] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem("signout_reason") === "idle") {
        sessionStorage.removeItem("signout_reason");
        setIdleBanner(true);
      }
    } catch {}
  }, []);

  const cleanEmail = email.trim().toLowerCase();
  const validEmail = EMAIL_RE.test(cleanEmail);

  const onGoogle = async () => {
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error(result.error.message ?? "Sign-in failed");
      setBusy(false);
    }
  };

  const onSendLink = async () => {
    if (!validEmail || sending) return;
    setSending(true);
    setEmailError(null);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) {
        setEmailError(friendlyError(error.message));
        setSending(false);
        return;
      }
      setSentTo(cleanEmail);
    } catch (e) {
      setEmailError(friendlyError(e instanceof Error ? e.message : ""));
    } finally {
      setSending(false);
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

        {idleBanner && (
          <div
            role="status"
            className="mt-5 w-full rounded-xl border px-4 py-3 text-left text-[13px]"
            style={{
              borderColor: "hsl(var(--brand-orange) / 0.4)",
              backgroundColor: "hsl(var(--brand-orange) / 0.08)",
              color: "hsl(var(--brand-navy))",
            }}
          >
            Signed out for inactivity. Sign in again to continue.
          </div>
        )}

        <button
          onClick={onGoogle}
          disabled={busy}
          className="mt-8 w-full inline-flex items-center justify-center gap-3 rounded-xl bg-white border px-4 py-3 text-[14px] font-medium shadow-sm hover:bg-muted/30 transition-colors disabled:opacity-60"
          style={{ borderColor: "hsl(var(--brand-navy) / 0.2)", color: "hsl(var(--brand-navy))", minHeight: 48 }}
        >
          <GoogleG />
          {busy ? "Redirecting…" : "Sign in with Google"}
        </button>

        {/* Divider */}
        <div className="mt-6 mb-4 w-full flex items-center gap-3" aria-hidden="true">
          <div className="flex-1 h-px bg-border" />
          <span className="text-[13px] text-muted-foreground">or</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        {sentTo ? (
          <div
            className="w-full rounded-xl border px-4 py-3 text-[13px] text-left"
            style={{ borderColor: "hsl(var(--brand-navy) / 0.2)", color: "hsl(var(--brand-navy))" }}
          >
            <div className="font-medium">✓ Sign-in link sent to {sentTo}</div>
            <div className="mt-1 text-muted-foreground">Check your inbox. The link expires in 1 hour.</div>
            <button
              onClick={() => { setSentTo(null); setEmail(""); }}
              className="mt-2 text-[12px] underline text-muted-foreground hover:text-foreground"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <div className="w-full flex flex-col gap-2">
            <label className="text-left text-[12px] text-muted-foreground" htmlFor="login-email">
              Email address
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); if (emailError) setEmailError(null); }}
              onBlur={() => setEmail((v) => v.trim().toLowerCase())}
              onKeyDown={(e) => { if (e.key === "Enter") void onSendLink(); }}
              placeholder="you@alvas.co"
              className="w-full rounded-xl border bg-white px-3 py-3 text-[14px] outline-none focus:ring-2 focus:ring-offset-1"
              style={{ borderColor: "hsl(var(--brand-navy) / 0.2)", minHeight: 48 }}
            />
            {emailError && (
              <div className="text-left text-[12px] text-destructive">{emailError}</div>
            )}
            <button
              onClick={onSendLink}
              disabled={!validEmail || sending}
              className="mt-1 w-full inline-flex items-center justify-center rounded-xl px-4 py-3 text-[14px] font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: "hsl(var(--brand-navy))",
                color: "white",
                minHeight: 48,
              }}
            >
              {sending ? "Sending…" : "Send sign-in link"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
