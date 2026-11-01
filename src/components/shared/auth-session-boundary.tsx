"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** Unmount private state immediately; refresh the server identity before reuse. */
export function AuthSessionBoundary({ userId, children }: { userId: string; children: React.ReactNode }) {
  const [stale, setStale] = useState(false);
  const router = useRouter();
  useEffect(() => {
    const client = createClient();
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      if (session?.user.id === userId) return;
      setStale(true);
      router.replace(session ? "/dashboard" : "/login");
      router.refresh();
    });
    return () => subscription.unsubscribe();
  }, [userId, router]);
  if (stale) return <div role="status" className="p-6 text-sm text-muted-foreground">Updating your session…</div>;
  return children;
}
