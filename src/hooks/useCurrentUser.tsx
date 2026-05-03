/**
 * Single source of truth for "who is using the app right now".
 *
 * For now this is a hardcoded mock (Avinash V.). When real auth lands, only
 * this provider needs to change — every consumer (header chip, project log,
 * notes attribution) reads from here.
 */
import { createContext, useContext, ReactNode } from "react";

export interface CurrentUser {
  userId: string;
  /** Full legal name — shown in popovers and on internal records. */
  fullName: string;
  /** Compact "First L." label for header + log entries. */
  shortName: string;
  /** Two-letter monogram for the avatar circle. */
  initials: string;
}

const DEFAULT_CURRENT_USER: CurrentUser = {
  userId: "av",
  fullName: "Avinash Vaswani",
  shortName: "Avinash V.",
  initials: "AV",
};

const Ctx = createContext<CurrentUser>(DEFAULT_CURRENT_USER);

export const CurrentUserProvider = ({ children }: { children: ReactNode }) => (
  <Ctx.Provider value={DEFAULT_CURRENT_USER}>{children}</Ctx.Provider>
);

export const useCurrentUser = (): CurrentUser => useContext(Ctx);

/** Convenience for non-React code paths (seed/migration). */
export const SYSTEM_CURRENT_USER = DEFAULT_CURRENT_USER;
