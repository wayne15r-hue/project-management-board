"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar } from "./avatar";
import { cn } from "@/lib/utils";
import type { ChatProfile } from "@/types/chat";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (conversationId: string) => void;
}

export function NewConversationDialog(props: Props) {
  return props.open ? <ConversationDialogContent {...props} /> : null;
}

function ConversationDialogContent({ open, onOpenChange, onCreated }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ChatProfile[]>([]);
  const [selected, setSelected] = useState<ChatProfile[]>([]);
  const [groupName, setGroupName] = useState("");
  const [explicitGroup, setExplicitGroup] = useState(false);
  const [groupNameError, setGroupNameError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const res = await fetch(
        `/api/profile/search?q=${encodeURIComponent(query)}`, { signal: controller.signal }
      ).catch(() => null);
      if (res?.ok) { const results = await res.json(); if (!controller.signal.aborted) setResults(results); }
    }, 200);
    return () => {
      controller.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [open, query]);

  function toggle(user: ChatProfile) {
    setSelected((prev) =>
      prev.some((p) => p.id === user.id)
        ? prev.filter((p) => p.id !== user.id)
        : prev.length < 49 ? [...prev, user] : prev
    );
  }

  async function handleCreate() {
    if (selected.length === 0) {
      toast.error("Pick at least one person to start a conversation.");
      return;
    }
    const isGroup = explicitGroup || selected.length > 1;
    const trimmedGroupName = groupName.trim();
    if (isGroup && (!trimmedGroupName || trimmedGroupName.length > 100)) {
      setGroupNameError("Group name must contain 1–100 characters.");
      return;
    }
    setGroupNameError(null);
    if (creating) return;
    setCreating(true);
    try {
      let res: Response;
      try {
        res = await fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: isGroup ? "group" : "direct",
            userIds: selected.map((s) => s.id),
            name: isGroup ? trimmedGroupName : null,
          }),
        });
      } catch {
        toast.error("Connection lost. Please try again.");
        return;
      }
      if (!res.ok) {
        const j = await res.json().catch(() => ({} as { error?: string }));
        const msg = (j as { error?: string }).error || "";
        if (/row-level security/i.test(msg)) {
          toast.error(
            "You don't have permission to create conversations. Please sign out and back in."
          );
        } else {
          toast.error(msg || "Couldn't start conversation.");
        }
        return;
      }
      const data = await res.json();
      onCreated(data.id);
    } finally {
      setCreating(false);
    }
  }

  const isGroup = explicitGroup || selected.length > 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New conversation</DialogTitle>
        </DialogHeader>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={explicitGroup} onChange={e => setExplicitGroup(e.target.checked)} disabled={creating}/>
          Create group
        </label>
        <p className="text-xs text-muted-foreground">Select 1–49 people. Groups can have up to 50 members including you.</p>

        {selected.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {selected.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => toggle(s)}
                className="flex items-center gap-1.5 rounded-full bg-accent px-2 py-1 text-[12px]"
              >
                <Avatar
                  name={s.full_name || s.email}
                  src={s.avatar_url}
                  size={18}
                />
                <span>{s.full_name || s.email}</span>
                <span className="text-muted-foreground">×</span>
              </button>
            ))}
          </div>
        )}

        <Input
          aria-label="Search by name or email"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or email"
          autoFocus
        />

        <div className="max-h-60 overflow-y-auto">
          {results.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No matches
            </p>
          ) : (
            <ul className="space-y-0.5">
              {results.map((u) => {
                const isSelected = selected.some((s) => s.id === u.id);
                return (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() => toggle(u)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors",
                        isSelected
                          ? "bg-accent"
                          : "hover:bg-accent/60"
                      )}
                    >
                      <Avatar
                        name={u.full_name || u.email}
                        src={u.avatar_url}
                        size={28}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium">
                          {u.full_name || u.email}
                        </p>
                        {u.full_name && (
                          <p className="truncate text-[11px] text-muted-foreground">
                            {u.email}
                          </p>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {isGroup && (
          <div className="space-y-1">
            <label htmlFor="new-group-name">Group name (required)</label>
            <Input
              id="new-group-name"
              maxLength={100}
              required
              aria-describedby="new-group-name-help"
              value={groupName}
              onChange={(e) => {
                setGroupName(e.target.value);
                if (groupNameError) setGroupNameError(null);
              }}
              placeholder="Group name (required)"
              aria-invalid={groupNameError ? true : undefined}
              className={cn(groupNameError && "border-destructive")}
            />
            <p id="new-group-name-help" className="text-xs text-muted-foreground">1–100 characters.</p>
            {groupNameError && (
              <p className="text-[11px] text-destructive">{groupNameError}</p>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleCreate}
            disabled={
              selected.length === 0 ||
              creating ||
              (isGroup && (!groupName.trim() || groupName.trim().length > 100))
            }
          >
            {creating ? (
              <>
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                Creating…
              </>
            ) : (
              "Start"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
