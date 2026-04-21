"use client";

import { useState } from "react";
import {
  Sparkles,
  Loader2,
  Check,
  X,
  RefreshCw,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type Action =
  | "improve"
  | "shorter"
  | "longer"
  | "generate"
  | "acceptance_criteria";

const ACTIONS: { value: Action; label: string; hint: string }[] = [
  { value: "improve", label: "Improve writing", hint: "Fix grammar and clarity" },
  { value: "shorter", label: "Make it shorter", hint: "Condense" },
  { value: "longer", label: "Make it more detailed", hint: "Expand" },
  { value: "generate", label: "Generate description", hint: "From title" },
  {
    value: "acceptance_criteria",
    label: "Suggest acceptance criteria",
    hint: "As a checklist",
  },
];

interface Props {
  title: string;
  description: string;
  onAccept: (text: string) => void;
}

export function AIWritingAssistant({ title, description, onAccept }: Props) {
  const [loading, setLoading] = useState(false);
  const [lastAction, setLastAction] = useState<Action | null>(null);
  const [suggestion, setSuggestion] = useState<string | null>(null);

  async function run(action: Action) {
    setLoading(true);
    setLastAction(action);
    try {
      const res = await fetch("/api/ai/enhance-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, title, text: description }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.code === "no_key" || json.code === "not_enabled") {
          toast.error("Enable AI in Settings to use this feature.");
        } else {
          toast.error(json.error || "AI request failed");
        }
        return;
      }
      setSuggestion(json.text);
    } catch {
      toast.error("AI request failed");
    } finally {
      setLoading(false);
    }
  }

  function accept() {
    if (!suggestion) return;
    onAccept(suggestion);
    setSuggestion(null);
    toast.success("Applied ✨");
  }

  const hasContent = description.trim().length > 0;
  const primaryAction: Action = hasContent ? "improve" : "generate";
  const primaryLabel = hasContent ? "Improve with AI" : "Write with AI";

  return (
    <div>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={loading || (!hasContent && primaryAction !== "generate")}
          onClick={() => run(primaryAction)}
          className="h-7 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
        >
          {loading && lastAction === primaryAction ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Sparkles className="h-3 w-3" />
          )}
          {primaryLabel}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={loading}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-50"
            aria-label="More AI actions"
          >
            <ChevronDown className="h-3 w-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {ACTIONS.map((a) => (
              <DropdownMenuItem
                key={a.value}
                onClick={() => run(a.value)}
                className="flex flex-col items-start gap-0"
              >
                <span className="text-[13px]">{a.label}</span>
                <span className="text-[11px] text-muted-foreground">
                  {a.hint}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {suggestion !== null && (
        <div className="mt-2 rounded-lg border border-border bg-accent/30 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <Sparkles className="h-3 w-3" />
            AI suggestion
          </div>
          <pre
            className={cn(
              "whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-foreground"
            )}
          >
            {suggestion}
          </pre>
          <div className="mt-3 flex items-center justify-end gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setSuggestion(null)}
              disabled={loading}
              className="h-7 text-[12px]"
            >
              <X className="mr-1 h-3 w-3" />
              Reject
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => lastAction && run(lastAction)}
              disabled={loading}
              className="h-7 text-[12px]"
            >
              {loading ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="mr-1 h-3 w-3" />
              )}
              Try again
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={accept}
              disabled={loading}
              className="h-7 text-[12px]"
            >
              <Check className="mr-1 h-3 w-3" />
              Accept
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
