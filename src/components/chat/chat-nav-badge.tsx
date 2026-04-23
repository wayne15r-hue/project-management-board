"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

interface ChatNavBadgeProps {
  collapsed?: boolean;
}

export function ChatNavBadge({ collapsed }: ChatNavBadgeProps) {
  const [total, setTotal] = useState(0);
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/conversations");
        if (!res.ok) return;
        const data: { unread_count?: number }[] = await res.json();
        if (cancelled) return;
        setTotal(
          data.reduce((sum, c) => sum + (c.unread_count ?? 0), 0)
        );
      } catch {
        /* ignore */
      }
    }

    load();

    const supabase = createClient();
    const channel = supabase
      .channel("chat-nav-badge")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        () => load()
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conversation_members" },
        () => load()
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  // Hide when on chat page (user is actively reading)
  if (pathname.startsWith("/dashboard/chat")) return null;
  if (total <= 0) return null;

  const label = total > 99 ? "99+" : String(total);

  if (collapsed) {
    return (
      <span
        className={cn(
          "absolute right-1 top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-semibold leading-none text-white"
        )}
      >
        {label}
      </span>
    );
  }
  return (
    <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-white">
      {label}
    </span>
  );
}
