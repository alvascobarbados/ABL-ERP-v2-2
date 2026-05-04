/**
 * usePresence — Supabase Realtime presence per project.
 *
 * Subscribes to a channel keyed off `project:<projectId>` and tracks the
 * current user via channel.track(). Returns the list of OTHER users
 * currently present (self is filtered out).
 *
 * Until real auth lands, identity comes from useCurrentUser (a mock).
 * A random sessionId disambiguates browser tabs sharing the same identity.
 */
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "./useCurrentUser";

export interface PresentUser {
  sessionId: string;
  userId: string;
  fullName: string;
  shortName: string;
  initials: string;
}

const sessionId =
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

export function usePresence(projectId: string | null | undefined): PresentUser[] {
  const me = useCurrentUser();
  const [others, setOthers] = useState<PresentUser[]>([]);
  const meRef = useRef(me);
  meRef.current = me;

  useEffect(() => {
    if (!projectId) return;
    const channel = supabase.channel(`project:${projectId}`, {
      config: { presence: { key: sessionId } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<PresentUser>();
        const list: PresentUser[] = [];
        for (const key of Object.keys(state)) {
          const metas = state[key] as unknown as PresentUser[];
          if (!metas?.length) continue;
          const m = metas[0];
          if (m.sessionId === sessionId) continue;
          list.push(m);
        }
        setOthers(list);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            sessionId,
            userId: meRef.current.userId,
            fullName: meRef.current.fullName,
            shortName: meRef.current.shortName,
            initials: meRef.current.initials,
          } satisfies PresentUser);
        }
      });

    return () => {
      channel.untrack().catch(() => {});
      supabase.removeChannel(channel);
    };
  }, [projectId]);

  return others;
}
