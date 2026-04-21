"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, Plus, X } from "lucide-react";
import { toast } from "sonner";
import type { Priority, Profile, Label } from "@/types";

interface Suggestion {
  priority: Priority | null;
  labels: string[];
  assignee_name: string | null;
}

interface Props {
  cardId: string;
  boardId: string;
  title: string;
  description: string;
  currentPriority: Priority;
  currentLabels: Label[];
  currentAssigneeId: string | null;
  members: Profile[];
  onApplyPriority: (p: Priority) => void;
  onApplyAssignee: (id: string) => void;
  onApplyLabel: (label: Label) => void;
}

const cache = new Map<string, Suggestion>();

export function AISuggestions({
  cardId,
  boardId,
  title,
  description,
  currentPriority,
  currentLabels,
  currentAssigneeId,
  members,
  onApplyPriority,
  onApplyAssignee,
  onApplyLabel,
}: Props) {
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(false);
  const requestedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!title.trim() || dismissed) return;
    const cacheKey = `${cardId}:${title}:${description.slice(0, 200)}`;
    if (requestedFor.current === cacheKey) return;
    requestedFor.current = cacheKey;

    const cached = cache.get(cacheKey);
    if (cached) {
      setSuggestion(cached);
      return;
    }

    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/ai/suggest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cardId, title, description, boardId }),
        });
        if (!res.ok) return;
        const json = (await res.json()) as Suggestion;
        cache.set(cacheKey, json);
        setSuggestion(json);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }, 600);

    return () => clearTimeout(t);
  }, [cardId, boardId, title, description, dismissed]);

  if (dismissed || !suggestion) return null;

  // Filter out suggestions that match current state
  const showPriority =
    suggestion.priority && suggestion.priority !== currentPriority;
  const currentLabelNames = new Set(
    currentLabels.map((l) => l.name.toLowerCase())
  );
  const newLabels = (suggestion.labels || []).filter(
    (n) => !currentLabelNames.has(n.toLowerCase())
  );
  const suggestedMember = suggestion.assignee_name
    ? members.find((m) =>
        (m.full_name || m.email)
          .toLowerCase()
          .includes(suggestion.assignee_name!.toLowerCase())
      )
    : null;
  const showAssignee =
    suggestedMember && suggestedMember.id !== currentAssigneeId;

  if (!showPriority && newLabels.length === 0 && !showAssignee) return null;

  async function applyLabelByName(name: string) {
    try {
      // Find or create label
      const res = await fetch(`/api/boards/${boardId}/labels`);
      if (!res.ok) throw new Error();
      const boardLabels = (await res.json()) as Label[];
      let match = boardLabels.find(
        (l) => l.name.toLowerCase() === name.toLowerCase()
      );
      if (!match) {
        const createRes = await fetch(`/api/boards/${boardId}/labels`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, color: "#6b7280" }),
        });
        if (!createRes.ok) throw new Error();
        match = await createRes.json();
      }
      if (!match) throw new Error();
      await fetch(`/api/cards/${cardId}/labels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label_id: match.id }),
      });
      onApplyLabel(match);
    } catch {
      toast.error("Failed to apply label");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-dashed border-border bg-accent/20 px-2.5 py-1.5">
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
        <Sparkles className="h-3 w-3" />
        {loading ? "Thinking…" : "Suggested:"}
      </span>
      {showPriority && (
        <SuggestionChip
          onClick={() => {
            onApplyPriority(suggestion.priority!);
            toast.success("Priority updated");
          }}
        >
          Priority: {suggestion.priority}
        </SuggestionChip>
      )}
      {showAssignee && suggestedMember && (
        <SuggestionChip
          onClick={() => {
            onApplyAssignee(suggestedMember.id);
            toast.success("Assigned");
          }}
        >
          Assign: {suggestedMember.full_name || suggestedMember.email}
        </SuggestionChip>
      )}
      {newLabels.slice(0, 4).map((name) => (
        <SuggestionChip key={name} onClick={() => applyLabelByName(name)}>
          Label: {name}
        </SuggestionChip>
      ))}
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="ml-auto text-muted-foreground hover:text-foreground"
        aria-label="Dismiss suggestions"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

function SuggestionChip({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] text-foreground transition-colors hover:bg-accent"
    >
      <Plus className="h-2.5 w-2.5" />
      {children}
    </button>
  );
}
