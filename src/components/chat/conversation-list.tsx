"use client";

import { Plus, Search, MessageSquare } from "lucide-react";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Avatar } from "./avatar";
import { cn } from "@/lib/utils";
import type { Conversation } from "@/types/chat";

interface Props {
  conversations: Conversation[];
  activeId: string | null;
  currentUserId: string;
  loading: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
}

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function ConversationList({
  conversations,
  activeId,
  currentUserId,
  loading,
  onSelect,
  onNew,
}: Props) {
  const [query, setQuery] = useState("");

  function titleFor(c: Conversation): string {
    if (c.name) return c.name;
    const others = c.members.filter((m) => m.id !== currentUserId);
    if (others.length === 0) return "You";
    if (c.type === "direct") {
      const o = others[0];
      return o?.full_name || o?.email || "Unknown user";
    }
    const names = others
      .map((o) => o.full_name || o.email.split("@")[0])
      .slice(0, 3);
    return names.length > 0 ? names.join(", ") : "Unnamed group";
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => titleFor(c).toLowerCase().includes(q));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations, query]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-3">
        <h2 className="text-[15px] font-semibold">Chat</h2>
        <button
          type="button"
          onClick={onNew}
          aria-label="New conversation"
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <div className="relative px-3 py-2">
        <Search className="pointer-events-none absolute left-5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search"
          className="h-8 pl-7 text-[13px]"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-1 px-2 py-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-14 animate-pulse rounded-md bg-muted/50"
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center text-sm text-muted-foreground">
            <MessageSquare className="h-6 w-6 opacity-50" />
            <p>No conversations yet.</p>
            <button
              type="button"
              onClick={onNew}
              className="text-[13px] font-medium text-primary hover:underline"
            >
              Start one
            </button>
          </div>
        ) : (
          <ul className="px-1.5 py-1">
            {filtered.map((c) => {
              const others = c.members.filter((m) => m.id !== currentUserId);
              const primary = others[0] ?? c.members[0] ?? null;
              const isActive = c.id === activeId;
              const lastPreview =
                c.last_message?.message_type === "text"
                  ? c.last_message.content ?? ""
                  : c.last_message?.message_type === "image"
                    ? "Image"
                    : c.last_message?.message_type === "file"
                      ? "File"
                      : "";
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(c.id)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors",
                      isActive
                        ? "bg-accent text-accent-foreground"
                        : "hover:bg-accent/60"
                    )}
                  >
                    <Avatar
                      name={primary?.full_name || primary?.email || "?"}
                      src={primary?.avatar_url ?? null}
                      size={36}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[13px] font-medium">
                          {titleFor(c)}
                        </span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {relativeTime(c.last_message_at)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-[12px] text-muted-foreground">
                          {lastPreview || "No messages yet"}
                        </p>
                        {c.unread_count > 0 && (
                          <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                            {c.unread_count}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
