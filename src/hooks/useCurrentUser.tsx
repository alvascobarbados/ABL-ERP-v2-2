/**
 * Real auth-backed current user. Subscribes to Supabase session and
 * resolves the signed-in Google account against `team_members.email`
 * (case-insensitive) for the allowlist gate.
 *
 * TODO: enforce allowlist via RLS policies, not client-side. Current
 * implementation is gate-only — a determined attacker with any valid
 * Google JWT could hit the API directly until RLS is tightened.
 */
import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import Login from "@/pages/Login";

export interface CurrentUser {
  userId: string;
  fullName: string;
  shortName: string;
  initials: string;
  email: string;
  role?: string | null;
  signOut: () => Promise<void>;
}

const SYSTEM_USER: CurrentUser = {
  userId: "system",
  fullName: "System",
  shortName: "System",
  initials: "SY",
  email: "",
  signOut: async () => {},
};

/** Non-React fallback (seed scripts). Not used at runtime. */
export const SYSTEM_CURRENT_USER = {
  userId: "av",
  fullName: "Avinash Vaswani",
  shortName: "Avinash V.",
  initials: "AV",
};

const Ctx = createContext<CurrentUser>(SYSTEM_USER);

const shortNameOf = (full: string) => {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
};

type Status = "loading" | "anon" | "authed";

export const CurrentUserProvider = ({ children }: { children: ReactNode }) => {
  const [status, setStatus] = useState<Status>("loading");
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const resolvedFor = useRef<string | null>(null);

  // 1) Listener BEFORE getSession (Supabase pattern).
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      // Synchronous-only inside the listener — defer DB work.
      setSession(s);
      if (!s) {
        setUser(null);
        resolvedFor.current = null;
        setStatus("anon");
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) setStatus("anon");
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // 2) Allowlist resolution — runs in effect, not in the auth listener.
  useEffect(() => {
    if (!session?.user) return;
    const email = (session.user.email ?? "").toLowerCase();
    if (!email) return;
    if (resolvedFor.current === email) return;
    resolvedFor.current = email;

    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("team_members")
        .select("id, full_name, initials, email, role")
        .ilike("email", email)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        toast.error("This Google account isn't authorized. Contact your admin to be added to the team.");
        await supabase.auth.signOut();
        return;
      }
      setUser({
        userId: data.id,
        fullName: data.full_name,
        shortName: shortNameOf(data.full_name),
        initials: (data.initials || data.full_name.slice(0, 2)).toUpperCase(),
        email: data.email ?? email,
        role: data.role,
        signOut: async () => { await supabase.auth.signOut(); },
      });
      setStatus("authed");
    })();
    return () => { cancelled = true; };
  }, [session]);

  if (status === "loading") {
    return (
      <div
        className="min-h-dvh flex flex-col items-center justify-center gap-3"
        style={{ backgroundColor: "hsl(var(--background))" }}
      >
        <span
          className="font-display text-[40px] leading-none tracking-tight"
          style={{ fontWeight: 600 }}
        >
          <span style={{ color: "hsl(var(--brand-navy))" }}>alvas</span>
          <span style={{ color: "hsl(var(--brand-orange))" }}>co</span>
        </span>
        <span className="text-xs text-muted-foreground">Loading…</span>
      </div>
    );
  }

  if (status === "anon" || !user) {
    return <Login />;
  }

  return <Ctx.Provider value={user}>{children}</Ctx.Provider>;
};

export const useCurrentUser = (): CurrentUser => useContext(Ctx);
