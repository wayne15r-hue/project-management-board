"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import dynamic from "next/dynamic";
import {
  ArrowLeft,
  Trash2,
  Smile,
  Download,
  FileIcon,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "./avatar";
import { MessageInput } from "./message-input";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type {
  ChatProfile,
  Conversation,
  Message,
  MessageReaction,
} from "@/types/chat";

const EmojiPicker = dynamic(() => import("emoji-picker-react"), { ssr: false });

const QUICK_EMOJIS = ["👍", "❤️", "😂", "🎉", "😮", "😢", "🙏", "🔥"];

interface Props {
  conversation: Conversation;
  currentUser: ChatProfile;
  onBack: () => void;
  onMessageSent: () => void;
  onDelete: (conversationId: string) => void | Promise<void>;
}

interface PresenceState {
  user_id: string;
  full_name: string;
  typing: boolean;
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

function formatSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [lightbox, setLightbox] = useState<Message | null>(null);
  const [typingUsers, setTypingUsers] = useState<PresenceState[]>([]);
  const [memberReads, setMemberReads] = useState<
    Map<string, string>
  >(new Map());

  const scrollRef = useRef<HTMLDivElement>(null);
  const stickBottom = useRef(true);
  const typingChannelRef = useRef<ReturnType<
    ReturnType<typeof createClient>["channel"]
  > | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);
  const lastReadSentRef = useRef(0);

  const otherMembers = useMemo(
    () => conversation.members.filter((m) => m.id !== currentUser.id),
    [conversation.members, currentUser.id]
  );

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

  const markRead = useCallback(() => {
    const now = Date.now();
    if (now - lastReadSentRef.current < 2000) return;
    lastReadSentRef.current = now;
    fetch(`/api/conversations/${conversation.id}/read`, { method: "POST" });
  }, [conversation.id]);

  useEffect(() => {
    markRead();
  }, [markRead]);

  // Load initial member last_read_at + subscribe to changes
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    (async () => {
      const { data } = await supabase
        .from("conversation_members")
        .select("user_id, last_read_at")
        .eq("conversation_id", conversation.id);
      if (cancelled) return;
      const map = new Map<string, string>();
      for (const row of data ?? []) {
        if (row.last_read_at) map.set(row.user_id, row.last_read_at);
      }
      setMemberReads(map);
    })();

    const channel = supabase
      .channel(`conv-reads-${conversation.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversation_members",
          filter: `conversation_id=eq.${conversation.id}`,
        },
        (payload) => {
          const row = payload.new as {
            user_id: string;
            last_read_at: string | null;
          };
          if (!row.last_read_at) return;
          setMemberReads((prev) => {
            const next = new Map(prev);
            next.set(row.user_id, row.last_read_at!);
            return next;
          });
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [conversation.id]);

  // Realtime: new messages + reactions
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
          if (row.sender_id === currentUser.id) return;
          const { data: sender } = await supabase
            .from("profiles")
            .select("id, full_name, email, avatar_url")
            .eq("id", row.sender_id)
            .single();
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            return [
              ...prev,
              { ...row, sender: sender ?? null, reactions: [] },
            ];
          });
          markRead();
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "message_reactions" },
        (payload) => {
          const row = payload.new as {
            message_id: string;
            user_id: string;
            emoji: string;
          };
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== row.message_id) return m;
              return applyReaction(m, row.emoji, row.user_id, "add");
            })
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "message_reactions" },
        (payload) => {
          const row = payload.old as {
            message_id: string;
            user_id: string;
            emoji: string;
          };
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== row.message_id) return m;
              return applyReaction(m, row.emoji, row.user_id, "remove");
            })
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversation.id, currentUser.id, markRead]);

  // Typing presence channel
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`typing:${conversation.id}`, {
      config: { presence: { key: currentUser.id } },
    });
    typingChannelRef.current = channel;

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState() as Record<
          string,
          PresenceState[]
        >;
        const active: PresenceState[] = [];
        for (const key of Object.keys(state)) {
          if (key === currentUser.id) continue;
          const entry = state[key]?.[0];
          if (entry?.typing) active.push(entry);
        }
        setTypingUsers(active);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            user_id: currentUser.id,
            full_name:
              currentUser.full_name || currentUser.email || "User",
            typing: false,
          });
        }
      });

    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      supabase.removeChannel(channel);
      typingChannelRef.current = null;
    };
  }, [conversation.id, currentUser.id, currentUser.full_name, currentUser.email]);

  const emitTyping = useCallback(() => {
    const channel = typingChannelRef.current;
    if (!channel) return;
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      channel.track({
        user_id: currentUser.id,
        full_name: currentUser.full_name || currentUser.email || "User",
        typing: true,
      });
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      channel.track({
        user_id: currentUser.id,
        full_name: currentUser.full_name || currentUser.email || "User",
        typing: false,
      });
    }, 3000);
  }, [currentUser.id, currentUser.full_name, currentUser.email]);

  const stopTyping = useCallback(() => {
    const channel = typingChannelRef.current;
    if (!channel) return;
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    isTypingRef.current = false;
    channel.track({
      user_id: currentUser.id,
      full_name: currentUser.full_name || currentUser.email || "User",
      typing: false,
    });
  }, [currentUser.id, currentUser.full_name, currentUser.email]);

  // Auto-scroll
  useEffect(() => {
    if (!stickBottom.current) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, typingUsers]);

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const nearBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    stickBottom.current = nearBottom;
    if (nearBottom) markRead();
  }

  async function handleSend(content: string) {
    stopTyping();
    const res = await fetch(
      `/api/conversations/${conversation.id}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, message_type: "text" }),
      }
    );
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j?.error || "Couldn't send message.");
      return;
    }
    const msg: Message = await res.json();
    setMessages((prev) =>
      prev.some((m) => m.id === msg.id)
        ? prev
        : [...prev, { ...msg, reactions: [] }]
    );
    stickBottom.current = true;
    onMessageSent();
  }

  async function handleUpload(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(
      `/api/conversations/${conversation.id}/upload`,
      { method: "POST", body: fd }
    );
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j?.error || "Upload failed.");
      return;
    }
    const msg: Message = await res.json();
    setMessages((prev) =>
      prev.some((m) => m.id === msg.id)
        ? prev
        : [...prev, { ...msg, reactions: [] }]
    );
    stickBottom.current = true;
    onMessageSent();
  }

  async function toggleReaction(messageId: string, emoji: string) {
    const res = await fetch(`/api/messages/${messageId}/reactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emoji }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j?.error || "Couldn't react.");
      return;
    }
    // realtime echo also updates; optimistic local update too
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m;
        const has =
          m.reactions?.some(
            (r) => r.emoji === emoji && r.user_ids.includes(currentUser.id)
          ) ?? false;
        return applyReaction(
          m,
          emoji,
          currentUser.id,
          has ? "remove" : "add"
        );
      })
    );
  }

  // Drag & drop
  const [dragging, setDragging] = useState(false);
  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragging(true);
  }
  function onDragLeave() {
    setDragging(false);
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) setPendingFile(file);
  }

  const title = titleOf(conversation, currentUser.id);
  const primary =
    conversation.members.find((m) => m.id !== currentUser.id) ??
    conversation.members[0] ??
    null;

  // "Seen" marker calculation — latest own message seen by at least one other
  const { seenMessageId, seenByCounts } = useMemo(() => {
    const seenByCounts = new Map<string, number>();
    let seenMessageId: string | null = null;
    const others = otherMembers;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.sender_id !== currentUser.id) continue;
      const msgTime = new Date(m.created_at).getTime();
      let seenBy = 0;
      for (const other of others) {
        const lr = memberReads.get(other.id);
        if (lr && new Date(lr).getTime() >= msgTime) seenBy++;
      }
      if (seenBy > 0) {
        seenByCounts.set(m.id, seenBy);
        if (!seenMessageId) seenMessageId = m.id;
      }
    }
    return { seenMessageId, seenByCounts };
  }, [messages, memberReads, otherMembers, currentUser.id]);

  const typingLabel = useMemo(() => {
    if (typingUsers.length === 0) return null;
    if (typingUsers.length === 1)
      return `${typingUsers[0].full_name} is typing`;
    if (typingUsers.length === 2)
      return `${typingUsers[0].full_name} and ${typingUsers[1].full_name} are typing`;
    return `${typingUsers.length} people are typing`;
  }, [typingUsers]);

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
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
        className={cn(
          "relative min-h-0 flex-1 overflow-y-auto px-4 py-3",
          dragging && "bg-accent/40"
        )}
      >
        {dragging && (
          <div className="pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-primary/50 bg-background/80 text-sm font-medium text-primary">
            Drop file to attach
          </div>
        )}
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
              const isSeen = seenMessageId === m.id;
              const seenByCount = seenByCounts.get(m.id) ?? 0;
              return (
                <li
                  key={m.id}
                  className={cn(
                    "group/msg flex gap-2.5",
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
                      "relative flex min-w-0 max-w-[75%] flex-col gap-0.5",
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
                    <div className="relative">
                      <MessageBubble
                        message={m}
                        own={own}
                        onOpenImage={() => setLightbox(m)}
                      />
                      <div
                        className={cn(
                          "absolute top-0 flex -translate-y-1/2 opacity-0 transition-opacity group-hover/msg:opacity-100",
                          own ? "left-0 -translate-x-full pr-1" : "right-0 translate-x-full pl-1"
                        )}
                      >
                        <ReactionToolbar
                          onPick={(emoji) => toggleReaction(m.id, emoji)}
                        />
                      </div>
                    </div>
                    {m.reactions && m.reactions.length > 0 && (
                      <div
                        className={cn(
                          "mt-0.5 flex flex-wrap gap-1",
                          own ? "justify-end" : "justify-start"
                        )}
                      >
                        {m.reactions.map((r) => {
                          const mine = r.user_ids.includes(currentUser.id);
                          return (
                            <button
                              key={r.emoji}
                              type="button"
                              onClick={() => toggleReaction(m.id, r.emoji)}
                              className={cn(
                                "flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] transition-colors",
                                mine
                                  ? "border-primary bg-primary/10 text-foreground"
                                  : "border-border bg-muted/60 text-foreground hover:bg-muted"
                              )}
                            >
                              <span>{r.emoji}</span>
                              <span className="tabular-nums">{r.count}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {own && isSeen && (
                      <SeenMarker
                        count={seenByCount}
                        total={otherMembers.length}
                        others={otherMembers}
                        reads={memberReads}
                        messageTime={m.created_at}
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {typingLabel && (
        <div className="flex items-center gap-2 border-t border-border bg-card px-4 py-1 text-[11px] text-muted-foreground">
          <TypingDots />
          <span>{typingLabel}…</span>
        </div>
      )}

      <MessageInput
        onSend={handleSend}
        onUpload={handleUpload}
        onTyping={emitTyping}
        pendingFile={pendingFile}
        setPendingFile={setPendingFile}
      />

      {lightbox && (
        <ImageLightbox
          message={lightbox}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}

function applyReaction(
  message: Message,
  emoji: string,
  userId: string,
  action: "add" | "remove"
): Message {
  const reactions: MessageReaction[] = message.reactions
    ? message.reactions.map((r) => ({ ...r, user_ids: [...r.user_ids] }))
    : [];
  const idx = reactions.findIndex((r) => r.emoji === emoji);
  if (action === "add") {
    if (idx === -1) {
      reactions.push({ emoji, count: 1, user_ids: [userId] });
    } else {
      if (!reactions[idx].user_ids.includes(userId)) {
        reactions[idx].user_ids.push(userId);
        reactions[idx].count = reactions[idx].user_ids.length;
      }
    }
  } else {
    if (idx !== -1) {
      reactions[idx].user_ids = reactions[idx].user_ids.filter(
        (u) => u !== userId
      );
      reactions[idx].count = reactions[idx].user_ids.length;
      if (reactions[idx].count === 0) reactions.splice(idx, 1);
    }
  }
  return { ...message, reactions };
}

function MessageBubble({
  message,
  own,
  onOpenImage,
}: {
  message: Message;
  own: boolean;
  onOpenImage: () => void;
}) {
  if (message.message_type === "image" && message.file_url) {
    return (
      <button
        type="button"
        onClick={onOpenImage}
        className="block overflow-hidden rounded-2xl border border-border bg-background"
      >
        <img
          src={message.file_url}
          alt={message.file_name ?? "image"}
          className="block max-h-[300px] max-w-[300px] object-cover"
        />
      </button>
    );
  }
  if (message.message_type === "file" && message.file_url) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-2xl border px-3 py-2 text-[13px]",
          own
            ? "border-primary/30 bg-primary/10"
            : "border-border bg-muted"
        )}
      >
        <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="truncate font-medium">{message.file_name}</p>
          <p className="text-[11px] text-muted-foreground">
            {formatSize(message.file_size)}
          </p>
        </div>
        <a
          href={message.file_url}
          download={message.file_name ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-accent"
          aria-label="Download"
        >
          <Download className="h-3.5 w-3.5" />
        </a>
      </div>
    );
  }
  return (
    <div
      className={cn(
        "whitespace-pre-wrap break-words rounded-2xl px-3 py-1.5 text-[13px]",
        own
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-foreground"
      )}
    >
      {message.content}
    </div>
  );
}

function ReactionToolbar({ onPick }: { onPick: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <button
              type="button"
              aria-label="Add reaction"
              className="flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm hover:bg-accent hover:text-foreground"
            >
              <Smile className="h-3.5 w-3.5" />
            </button>
          }
        />
        <PopoverContent className="w-auto p-1">
          <div className="flex items-center gap-0.5">
            {QUICK_EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => {
                  onPick(e);
                  setOpen(false);
                }}
                className="flex h-7 w-7 items-center justify-center rounded hover:bg-accent"
              >
                <span className="text-base leading-none">{e}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setPickerOpen(true);
              }}
              className="ml-0.5 flex h-7 items-center justify-center rounded px-1.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              more
            </button>
          </div>
        </PopoverContent>
      </Popover>
      {pickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setPickerOpen(false)}>
          <div onClick={(e) => e.stopPropagation()}>
            <EmojiPicker
              onEmojiClick={(data) => {
                onPick(data.emoji);
                setPickerOpen(false);
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}

function SeenMarker({
  count,
  total,
  others,
  reads,
  messageTime,
}: {
  count: number;
  total: number;
  others: ChatProfile[];
  reads: Map<string, string>;
  messageTime: string;
}) {
  if (total <= 1) {
    const ts = others
      .map((o) => reads.get(o.id))
      .filter(Boolean)
      .sort()
      .pop();
    return (
      <span className="mt-0.5 text-[10px] text-muted-foreground">
        Seen{ts ? ` · ${formatTime(ts)}` : ""}
      </span>
    );
  }
  const msgMs = new Date(messageTime).getTime();
  const seers = others.filter((o) => {
    const lr = reads.get(o.id);
    return lr && new Date(lr).getTime() >= msgMs;
  });
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="mt-0.5 cursor-default text-[10px] text-muted-foreground">
            Seen by {count}
          </span>
        }
      />
      <TooltipContent>
        {seers.map((s) => s.full_name || s.email).join(", ")}
      </TooltipContent>
    </Tooltip>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-0.5">
      <span className="h-1 w-1 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
      <span className="h-1 w-1 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
      <span className="h-1 w-1 animate-bounce rounded-full bg-muted-foreground" />
    </span>
  );
}

function ImageLightbox({
  message,
  onClose,
}: {
  message: Message;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-full max-w-full flex-col gap-3"
      >
        <div className="flex items-center justify-between gap-3 text-white">
          <span className="truncate text-sm">{message.file_name}</span>
          <div className="flex items-center gap-1">
            {message.file_url && (
              <a
                href={message.file_url}
                download={message.file_name ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-white/10"
                aria-label="Download"
              >
                <Download className="h-4 w-4" />
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-white/10"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        {message.file_url && (
          <img
            src={message.file_url}
            alt={message.file_name ?? ""}
            className="max-h-[80vh] max-w-[90vw] rounded object-contain"
          />
        )}
      </div>
    </div>
  );
}
