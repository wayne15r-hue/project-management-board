"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Sparkles,
  Loader2,
  Copy,
  Mail,
  RefreshCw,
} from "lucide-react";
import { renderMarkdown } from "@/lib/markdown";
import { cn } from "@/lib/utils";

type Timeframe = "today" | "week" | "month" | "all";
type SummaryType = "digest" | "standup" | "health";

interface Props {
  boardId: string;
  boardName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TYPES: { id: SummaryType; label: string; desc: string }[] = [
  { id: "digest", label: "Digest", desc: "What happened" },
  { id: "standup", label: "Standup", desc: "My update" },
  { id: "health", label: "Health check", desc: "Honest analysis" },
];

const TIMEFRAMES: { id: Timeframe; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "all", label: "All time" },
];

export function BoardSummaryDialog({
  boardId,
  boardName,
  open,
  onOpenChange,
}: Props) {
  const [type, setType] = useState<SummaryType>("digest");
  const [timeframe, setTimeframe] = useState<Timeframe>("week");
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/board-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boardId, timeframe, type }),
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
      setText(json.text);
    } catch {
      toast.error("AI request failed");
    } finally {
      setLoading(false);
    }
  }

  async function copyToClipboard() {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied");
    } catch {
      toast.error("Copy failed");
    }
  }

  function emailSummary() {
    if (!text) return;
    const subject = encodeURIComponent(`${boardName} — AI summary`);
    const body = encodeURIComponent(text);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            AI Board Summary
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Type
            </p>
            <div className="grid grid-cols-3 gap-2">
              {TYPES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setType(t.id)}
                  className={cn(
                    "rounded-md border p-3 text-left text-[12px] transition-colors",
                    type === t.id
                      ? "border-foreground/40 bg-accent"
                      : "border-border hover:bg-accent/50"
                  )}
                >
                  <div className="font-medium text-foreground">{t.label}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {t.desc}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Timeframe
            </p>
            <div className="flex gap-1.5">
              {TIMEFRAMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTimeframe(t.id)}
                  className={cn(
                    "rounded-md border px-3 py-1 text-[12px] transition-colors",
                    timeframe === t.id
                      ? "border-foreground/40 bg-accent"
                      : "border-border hover:bg-accent/50"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {!text && (
            <Button
              type="button"
              onClick={generate}
              disabled={loading}
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                  Generate summary
                </>
              )}
            </Button>
          )}

          {text && (
            <>
              <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-border bg-accent/20 p-4 text-[13px] leading-relaxed">
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  {renderMarkdown(text)}
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={generate}
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Regenerate
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={emailSummary}
                >
                  <Mail className="mr-1.5 h-3.5 w-3.5" />
                  Email
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={copyToClipboard}
                >
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                  Copy
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
