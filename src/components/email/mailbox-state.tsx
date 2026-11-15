"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { emailRequest, EmailRequestError } from "@/lib/email/client";

const MailboxContext = createContext({ revision: 0, count: 0, refresh: () => {} });

export function EmailMailboxProvider({ userId, enabled = true, children }: {
  userId: string;
  enabled?: boolean;
  children: ReactNode;
}) {
  const [count, setCount] = useState(0);
  const [revision, setRevision] = useState(0);
  const [countOwner, setCountOwner] = useState(userId);
  const refresh = useRef<() => void>(() => {});

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let connected = false;
    let pending: ReturnType<typeof setTimeout> | undefined;
    let request: AbortController | undefined;
    async function load() {
      request?.abort();
      const current = new AbortController();
      request = current;
      try {
        const total = await emailRequest<number>(userId, { view: "count" }, { signal: current.signal });
        if (stopped || current.signal.aborted) return;
        setCountOwner(userId);
        setCount(total);
      } catch (error) {
        if (!stopped && !current.signal.aborted && error instanceof EmailRequestError && [401, 403, 409].includes(error.status)) {
          setCount(0);
        }
      }
    }

    function update() {
      clearTimeout(pending);
      pending = setTimeout(() => {
        if (stopped) return;
        setRevision((value) => value + 1);
        void load();
      }, 75);
    }
    const onVisibility = () => { if (!document.hidden) update(); };
    refresh.current = update;
    void load();
    const db = createClient();
    const channel = db.channel("email:" + userId, { config: { private: true } })
      .on("broadcast", { event: "mailbox" }, update)
      .subscribe((status) => {
        connected = status === "SUBSCRIBED";
        if (connected) update();
      });
    window.addEventListener("focus", update);
    window.addEventListener("online", update);
    document.addEventListener("visibilitychange", onVisibility);
    const timer = setInterval(() => { if (!connected && !document.hidden) update(); }, 30_000);
    return () => {
      stopped = true;
      refresh.current = () => {};
      clearTimeout(pending);
      clearInterval(timer);
      request?.abort();
      window.removeEventListener("focus", update);
      window.removeEventListener("online", update);
      document.removeEventListener("visibilitychange", onVisibility);
      void db.removeChannel(channel);
    };
  }, [enabled, userId]);

  return <MailboxContext.Provider value={{
    count: enabled && countOwner === userId ? count : 0,
    revision,
    refresh: () => refresh.current(),
  }}>{children}</MailboxContext.Provider>;
}

export function useEmailMailbox() {
  return useContext(MailboxContext);
}

export function EmailNavBadge({ collapsed }: { collapsed?: boolean }) {
  const { count } = useEmailMailbox();
  if (count <= 0) return null;
  const position = collapsed ? "absolute right-1 top-1 h-3.5 min-w-3.5 text-[9px]" : "ml-auto h-4 min-w-4 text-[10px]";
  return <span role="img" aria-label={count + (count === 1 ? " unread email" : " unread emails")}
    className={"inline-flex shrink-0 items-center justify-center rounded-full bg-sidebar-primary px-1 font-semibold text-sidebar-primary-foreground " + position}>
    {count > 99 ? "99+" : count}
  </span>;
}
