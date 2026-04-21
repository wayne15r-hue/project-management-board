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

export function NewConversationDialog({ open, onOpenChange, onCreated }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ChatProfile[]>([]);
  const [selected, setSelected] = useState<ChatProfile[]>([]);
  const [groupName, setGroupName] = useState("");
  const [groupNameError, setGroupNameError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setSelected([]);
      setGroupName("");
      setGroupNameError(null);
      setResults([]);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const res = await fetch(
        `/api/profile/search?q=${encodeURIComponent(query)}`
      );
      if (res.ok) setResults(await res.json());
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [open, query]);

  function toggle(user: ChatProfile) {
    setSelected((prev) =>
      prev.some((p) => p.id === user.id)
        ? prev.filter((p) => p.id !== user.id)
        : [...prev, user]
    );
  }

  async function handleCreate() {
    if (selected.length === 0) {
      toast.error("Pick at least one person to start a conversation.");
      return;
    }
    const isGroup = selected.length > 1;
    const trimmedGroupName = groupName.trim();
    if (isGroup && !trimmedGroupName) {
      setGroupNameError("Group name is required.");
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

  const isGroup = selected.length > 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New conversation</DialogTitle>
        </DialogHeader>

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
            <Input
              value={groupName}
              onChange={(e) => {
                setGroupName(e.target.value);
                if (groupNameError) setGroupNameError(null);
              }}
              placeholder="Group name (required)"
              aria-invalid={groupNameError ? true : undefined}
              className={cn(groupNameError && "border-destructive")}
            />
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
              (isGroup && !groupName.trim())
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
