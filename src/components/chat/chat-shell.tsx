"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { ConversationList } from "./conversation-list";
import { MessageThread } from "./message-thread";
import { NewConversationDialog } from "./new-conversation-dialog";
import type { ChatProfile, Conversation } from "@/types/chat";
import { cn } from "@/lib/utils";

interface Props {
  currentUser: ChatProfile;
}

export function ChatShell({ currentUser }: Props) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [newOpen, setNewOpen] = useState(false);

  const loadConversations = useCallback(async () => {
    const res = await fetch("/api/conversations");
    if (!res.ok) return;
    const data: Conversation[] = await res.json();
    setConversations(data);
    setLoading(false);
    if (!activeId && data.length > 0) setActiveId(data[0].id);
  }, [activeId]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Refresh list on new messages AND when the user is added to a new conversation
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`chat-list-${currentUser.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        () => loadConversations()
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "conversation_members",
          filter: `user_id=eq.${currentUser.id}`,
        },
        () => loadConversations()
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "conversations",
        },
        (payload) => {
          const deletedId = (payload.old as { id?: string } | null)?.id;
          if (!deletedId) return;
          setConversations((prev) => prev.filter((c) => c.id !== deletedId));
          setActiveId((cur) => (cur === deletedId ? null : cur));
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser.id, loadConversations]);

  const active = conversations.find((c) => c.id === activeId) ?? null;

  async function handleCreated(conversationId: string) {
    setNewOpen(false);
    await loadConversations();
    setActiveId(conversationId);
  }

  async function handleDelete(conversationId: string) {
    const res = await fetch(`/api/conversations/${conversationId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({} as { error?: string }));
      toast.error((j as { error?: string }).error || "Couldn't delete conversation.");
      return;
    }
    setConversations((prev) => prev.filter((c) => c.id !== conversationId));
    setActiveId((cur) => (cur === conversationId ? null : cur));
    toast.success("Conversation deleted.");
  }

  return (
    <div className="flex h-[calc(100vh-0px)] min-h-0 w-full">
      <aside
        className={cn(
          "flex w-[260px] shrink-0 flex-col border-r border-border bg-card",
          active ? "hidden md:flex" : "flex"
        )}
      >
        <ConversationList
          conversations={conversations}
          activeId={activeId}
          currentUserId={currentUser.id}
          loading={loading}
          onSelect={setActiveId}
          onNew={() => setNewOpen(true)}
        />
      </aside>
      <section
        className={cn(
          "flex min-w-0 flex-1 flex-col bg-background",
          active ? "flex" : "hidden md:flex"
        )}
      >
        {active ? (
          <MessageThread
            key={active.id}
            conversation={active}
            currentUser={currentUser}
            onBack={() => setActiveId(null)}
            onMessageSent={loadConversations}
            onDelete={handleDelete}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Select a conversation or start a new one
          </div>
        )}
      </section>
      <NewConversationDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={handleCreated}
      />
    </div>
  );
}
