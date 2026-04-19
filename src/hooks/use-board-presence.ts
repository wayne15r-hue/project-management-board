"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface PresenceUser {
  id: string;
  name: string;
  avatar_url: string | null;
}

export function useBoardPresence(boardId: string) {
  const [users, setUsers] = useState<PresenceUser[]>([]);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function start() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, email")
        .eq("id", user.id)
        .single();

      const channel = supabase.channel(`presence:board:${boardId}`, {
        config: { presence: { key: user.id } },
      });

      channel
        .on("presence", { event: "sync" }, () => {
          const state = channel.presenceState() as Record<
            string,
            { id: string; name: string; avatar_url: string | null }[]
          >;
          const flat: PresenceUser[] = [];
          const seen = new Set<string>();
          for (const arr of Object.values(state)) {
            for (const meta of arr) {
              if (seen.has(meta.id)) continue;
              seen.add(meta.id);
              flat.push(meta);
            }
          }
          setUsers(flat);
        })
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
            await channel.track({
              id: user.id,
              name:
                profile?.full_name ||
                profile?.email ||
                user.email ||
                "Anonymous",
              avatar_url: profile?.avatar_url ?? null,
            });
          }
        });

      return () => {
        channel.untrack();
        supabase.removeChannel(channel);
      };
    }

    let cleanup: (() => void) | undefined;
    start().then((fn) => {
      if (cancelled) {
        fn?.();
      } else {
        cleanup = fn;
      }
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [boardId]);

  return users;
}
