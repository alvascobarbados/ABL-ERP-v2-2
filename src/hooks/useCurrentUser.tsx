/**
 * Real auth-backed current user. Subscribes to Supabase session and
 * resolves the signed-in Google account against `team_members.email`
 * (case-insensitive) for the allowlist gate.
 *
 * Hardened: verbose logging, try/catch, 5s loading-state timeout.
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

  console.log("[auth] Render with status:", status);

  // 1) Listener BEFORE getSession (Supabase pattern).
  useEffect(() => {
    console.log("[auth] Provider mounted; useEffect running");
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      console.log("[auth] onAuthStateChange:", event, "hasSession=", !!s, "email=", s?.user?.email);
      // Synchronous-only inside the listener — defer DB work to the resolve effect.
      setSession(s);
      if (!s) {
        setUser(null);
        resolvedFor.current = null;
        setStatus("anon");
      }
    });
    console.log("[auth] Listener registered");

    supabase.auth.getSession().then(({ data, error }) => {
      console.log("[auth] getSession returned:", { hasSession: !!data.session, email: data.session?.user?.email, error: error?.message });
      setSession(data.session);
      if (!data.session) setStatus("anon");
    }).catch((e) => {
      console.error("[auth] getSession threw:", e);
      setStatus("anon");
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  // 2) Allowlist resolution — runs in effect, not in the auth listener.
  useEffect(() => {
    if (!session?.user) return;
    const email = (session.user.email ?? "").toLowerCase();
    if (!email) {
      console.warn("[auth] session has no email; signing out");
      setStatus("anon");
      void supabase.auth.signOut();
      return;
    }
    if (resolvedFor.current === email) return;
    resolvedFor.current = email;

    let cancelled = false;
    (async () => {
      try {
        console.log("[auth] querying team_members for email:", email);
        const { data, error } = await supabase
          .from("team_members")
          .select("id, full_name, initials, email, role")
          .ilike("email", email)
          .maybeSingle();
        if (cancelled) return;
        console.log("[auth] team_members query result:", { found: !!data, error: error?.message });
        if (error) {
          console.error("[auth] team_members query error:", error);
          toast.error("Couldn't verify your team membership. Please try again.");
          await supabase.auth.signOut();
          setStatus("anon");
          return;
        }
        if (!data) {
          toast.error("This Google account isn't authorized. Contact your admin to be added to the team.");
          await supabase.auth.signOut();
          setStatus("anon");
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
        console.log("[auth] Setting status to: authed");
        setStatus("authed");
      } catch (e) {
        if (cancelled) return;
        console.error("[auth] resolve threw:", e);
        setStatus("anon");
        try { await supabase.auth.signOut(); } catch {}
      }
    })();
    return () => { cancelled = true; };
    // Depend on stable primitives — using `session` object identity caused
    // the INITIAL_SESSION event (fired right after SIGNED_IN) to swap the
    // session reference, run cleanup, and cancel the in-flight team_members
    // query before its result could be applied.
  }, [session?.user?.id, session?.user?.email]);

  // 3) Hard 5s timeout on the loading state — never let users get stuck.
  useEffect(() => {
    if (status !== "loading") return;
    const t = setTimeout(() => {
      console.warn("[auth] Loading timed out after 5s; forcing anon");
      toast.error("Authentication check timed out. Please sign in again.");
      void supabase.auth.signOut();
      setStatus("anon");
    }, 5000);
    return () => clearTimeout(t);
  }, [status]);

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
