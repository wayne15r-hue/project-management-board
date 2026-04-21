"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "./avatar";
import { MessageInput } from "./message-input";
import { cn } from "@/lib/utils";
import type { ChatProfile, Conversation, Message } from "@/types/chat";

interface Props {
  conversation: Conversation;
  currentUser: ChatProfile;
  onBack: () => void;
  onMessageSent: () => void;
  onDelete: (conversationId: string) => void | Promise<void>;
}

function titleOf(conversation: Conversation, currentUserId: string) {
  if (conversation.name) return conversation.name;
  const others = conversation.members.filter((m) => m.id !== currentUserId);
  if (others.length === 0) return "You";
  if (conversation.type === "direct") {
    const o = others[0];
    return o?.full_name || o?.email || "Unknown user";
  }
  const names = others
    .map((o) => o.full_name || o.email.split("@")[0])
    .slice(0, 3);
  return names.length > 0 ? names.join(", ") : "Unnamed group";
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function shouldGroup(prev: Message | null, next: Message): boolean {
  if (!prev) return false;
  if (prev.sender_id !== next.sender_id) return false;
  return (
    new Date(next.created_at).getTime() - new Date(prev.created_at).getTime() <
    5 * 60 * 1000
  );
}

export function MessageThread({
  conversation,
  currentUser,
  onBack,
  onMessageSent,
  onDelete,
}: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickBottom = useRef(true);

  const loadMessages = useCallback(async () => {
    setLoading(true);
    const res = await fetch(
      `/api/conversations/${conversation.id}/messages?limit=50`
    );
    if (res.ok) {
      const data: Message[] = await res.json();
      setMessages(data);
    }
    setLoading(false);
  }, [conversation.id]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // Mark read whenever conversation changes
  useEffect(() => {
    fetch(`/api/conversations/${conversation.id}/read`, { method: "POST" });
  }, [conversation.id]);

  // Realtime subscribe to this conversation's messages
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`conv-${conversation.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversation.id}`,
        },
        async (payload) => {
          const row = payload.new as Message;
          if (row.sender_id === currentUser.id) {
            // Already have it from POST response; skip duplicate
            return;
          }
          // Fetch sender profile
          const { data: sender } = await supabase
            .from("profiles")
            .select("id, full_name, email, avatar_url")
            .eq("id", row.sender_id)
            .single();
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            return [...prev, { ...row, sender: sender ?? null }];
          });
          fetch(`/api/conversations/${conversation.id}/read`, {
            method: "POST",
          });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversation.id, currentUser.id]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (!stickBottom.current) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const nearBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    stickBottom.current = nearBottom;
  }

  async function handleSend(content: string) {
    const res = await fetch(
      `/api/conversations/${conversation.id}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, message_type: "text" }),
      }
    );
    if (!res.ok) return;
    const msg: Message = await res.json();
    setMessages((prev) =>
      prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]
    );
    stickBottom.current = true;
    onMessageSent();
  }

  const title = titleOf(conversation, currentUser.id);
  const primary =
    conversation.members.find((m) => m.id !== currentUser.id) ??
    conversation.members[0] ??
    null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          className="md:hidden flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <Avatar
          name={primary?.full_name || primary?.email || title}
          src={primary?.avatar_url ?? null}
          size={32}
        />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[14px] font-semibold">{title}</h2>
          <p className="truncate text-[11px] text-muted-foreground">
            {conversation.members.length}{" "}
            {conversation.members.length === 1 ? "member" : "members"}
          </p>
        </div>
        {conversation.current_user_is_admin && (
          <button
            type="button"
            onClick={() => {
              if (
                window.confirm(
                  "Delete this conversation? This removes all messages for everyone."
                )
              ) {
                onDelete(conversation.id);
              }
            }}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            aria-label="Delete conversation"
            title="Delete conversation"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </header>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
      >
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-10 animate-pulse rounded-lg bg-muted/50"
              />
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No messages yet. Say hi 👋
          </div>
        ) : (
          <ul className="space-y-0.5">
            {messages.map((m, idx) => {
              const prev = idx > 0 ? messages[idx - 1] : null;
              const grouped = shouldGroup(prev, m);
              const own = m.sender_id === currentUser.id;
              const senderName =
                m.sender?.full_name || m.sender?.email || "Unknown";
              return (
                <li
                  key={m.id}
                  className={cn(
                    "flex gap-2.5",
                    own ? "flex-row-reverse" : "flex-row",
                    grouped ? "mt-0.5" : "mt-3"
                  )}
                >
                  <div className="w-8 shrink-0">
                    {!grouped && (
                      <Avatar
                        name={senderName}
                        src={m.sender?.avatar_url ?? null}
                        size={32}
                      />
                    )}
                  </div>
                  <div
                    className={cn(
                      "flex min-w-0 max-w-[75%] flex-col gap-0.5",
                      own ? "items-end" : "items-start"
                    )}
                  >
                    {!grouped && (
                      <div
                        className={cn(
                          "flex items-center gap-2 text-[11px] text-muted-foreground",
                          own && "flex-row-reverse"
                        )}
                      >
                        <span className="font-medium text-foreground">
                          {own ? "You" : senderName}
                        </span>
                        <span>{formatTime(m.created_at)}</span>
                      </div>
                    )}
                    <div
                      className={cn(
                        "whitespace-pre-wrap break-words rounded-2xl px-3 py-1.5 text-[13px]",
                        own
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground"
                      )}
                    >
                      {m.content}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <MessageInput onSend={handleSend} />
    </div>
  );
}
