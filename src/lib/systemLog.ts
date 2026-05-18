/**
 * System-level audit entries (not tied to a specific project).
 * Stored in project_log_entries with sentinel project_id = '__system__'.
 * Activity.tsx detects this sentinel + the user_* action types and renders
 * the description line without a clickable project link.
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
    console.warn("[systemLog] insert failed", error);
  }
}
