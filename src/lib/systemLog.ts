/**
 * System-level audit entries (not tied to a specific project).
 *
 * Stored in `project_log_entries` against the sentinel project row
 * `__system__` (see migration that creates it). The sentinel exists purely
 * to satisfy the FK from `project_log_entries.project_id → projects.id`;
 * it is soft-deleted and filtered out of every project listing in the UI.
 *
 * `writeSystemLog` throws on failure — callers are responsible for catching
 * and surfacing a toast. Do NOT swallow errors here, or the
 * "log signin → set sessionStorage flag" sequence will skip retries on the
 * next sign-in when something goes wrong with the insert.
 */
import { supabase } from "@/integrations/supabase/client";

export const SYSTEM_PROJECT_ID = "__system__";

export type SystemActionType = "user_signin" | "user_signout";

interface WriteArgs {
  actionType: SystemActionType;
  actorUserId: string;
  actorDisplayName: string;
  description: string;
  metadata?: Record<string, unknown>;
}

export async function writeSystemLog(args: WriteArgs): Promise<void> {
  const id = `log-sys-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const { error } = await supabase.from("project_log_entries").insert({
    id,
    project_id: SYSTEM_PROJECT_ID,
    ts: new Date().toISOString(),
    actor_user_id: args.actorUserId,
    actor_display_name: args.actorDisplayName,
    action_type: args.actionType,
    description: args.description,
    metadata: (args.metadata ?? null) as never,
  });
  if (error) {
    console.error("[systemLog] insert failed", error);
    throw error;
  }
}
