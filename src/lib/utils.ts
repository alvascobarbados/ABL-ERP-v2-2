import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Derive a "short name" (e.g. "Avinash V.") from a full name. Mirrors the
 * shortening done in useCurrentUser so we can match against
 * project_log_entries.actor_display_name (which is stored as shortName).
 */
export function shortNameFromFull(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}
