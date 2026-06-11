/**
 * Per-project audit-log query, with filtered realtime invalidation.
 *
 * Replaces the global `project.log` array that used to live in
 * usePipelineStore. The store no longer fetches or subscribes to
 * project_log_entries — each open ProjectDetail page subscribes ONLY to
 * inserts/updates/deletes matching its own project_id and invalidates
 * the cached query on event.
 *
 * Returns entries in ts-ascending order, matching what rowToProject used
 * to deliver, so ActivitySection's existing sort logic is untouched.
 */
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ProjectLogEntry, ProjectLogActionType } from "@/data/pipelines";

const PROJECT_LOG_KEY = (projectId: string | null | undefined) =>
  ["project-log", projectId ?? ""] as const;

async function fetchProjectLog(projectId: string): Promise<ProjectLogEntry[]> {
  const { data, error } = await supabase
    .from("project_log_entries")
    .select("*")
    .eq("project_id", projectId)
    .order("ts", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    ts: new Date(r.ts),
    actor: { userId: r.actor_user_id, displayName: r.actor_display_name },
    actionType: r.action_type as ProjectLogActionType,
    description: r.description,
    metadata: (r.metadata ?? undefined) as any,
  }));
}

export function useProjectLog(projectId: string | null | undefined) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: PROJECT_LOG_KEY(projectId),
    queryFn: () => fetchProjectLog(projectId as string),
    enabled: !!projectId,
  });

  useEffect(() => {
    if (!projectId) return;
    const channel = supabase
      .channel(`project-log:${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "project_log_entries",
          filter: `project_id=eq.${projectId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: PROJECT_LOG_KEY(projectId) });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId, qc]);

  return query;
}
