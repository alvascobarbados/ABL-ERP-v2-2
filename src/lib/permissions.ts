/**
 * Centralized permission helpers.
 *
 * v1: Permissive — every signed-in user can do everything. These helpers
 * exist so that v1.x role-based gating slots in here without touching UI
 * call sites. When ready to lock down, replace the `return true` bodies
 * with role/ownership checks (e.g. `user.role === 'Admin' || note.authorUserId === user.userId`).
 */
import type { ProjectNote } from "@/data/pipelines";
import type { CurrentUser } from "@/hooks/useCurrentUser";

export function canEditNote(_note: ProjectNote, _user: CurrentUser): boolean {
  // v1: everyone can edit any note.
  // v1.x: return _user.role === "Admin" || _note.authorUserId === _user.userId;
  return true;
}

export function canDeleteNote(_note: ProjectNote, _user: CurrentUser): boolean {
  // v1: everyone can delete any note.
  // v1.x: same gating as edit.
  return true;
}
