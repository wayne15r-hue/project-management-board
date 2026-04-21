"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sparkles, Loader2, Send, X, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { useKeyboardShortcut } from "@/hooks/use-keyboard-shortcut";
import { renderMarkdown } from "@/lib/markdown";
import { cn } from "@/lib/utils";

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
  action?: ParsedAction;
}

type ParsedAction =
  | {
      kind: "create_card";
      data: {
        title: string;
        description?: string;
        priority?: "low" | "medium" | "high";
        due_date?: string | null;
      };
    }
  | { kind: "goto"; path: string };

const SUGGESTIONS = [
  "Summarize my week",
  "What should I work on next?",
  "Create a card for fixing the login bug",
  "Show overdue tasks",
];

export function AICommandBar() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();

  const boardId = extractBoardId(pathname);

  useKeyboardShortcut({
    key: "j",
    meta: true,
    ignoreInInputs: false,
    handler: (e) => {
      e.preventDefault();
      setOpen((v) => !v);
    },
  });

  useKeyboardShortcut({
    key: "Escape",
    meta: false,
    ignoreInInputs: false,
    enabled: open,
    handler: () => setOpen(false),
  });

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    const next: ChatMsg[] = [...messages, { role: "user", content }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, boardId }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.code === "no_key" || json.code === "not_enabled") {
          toast.error("Enable AI in Settings to use this feature.");
        } else {
          toast.error(json.error || "Chat failed");
        }
        return;
      }
      const parsed = parseAction(json.text);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: parsed.display,
          action: parsed.action ?? undefined,
        },
      ]);
    } catch {
      toast.error("Chat failed");
    } finally {
      setLoading(false);
    }
  }

  async function performAction(action: ParsedAction) {
    if (action.kind === "goto") {
      router.push(action.path);
      setOpen(false);
      return;
    }
    if (action.kind === "create_card") {
      if (!boardId) {
        toast.error("Open a board first to create cards here.");
        return;
      }
      try {
        const boardRes = await fetch(`/api/boards/${boardId}`);
        if (!boardRes.ok) throw new Error();
        const board = await boardRes.json();
        const firstCol = board.columns?.[0];
        if (!firstCol) throw new Error();
        const res = await fetch(`/api/boards/${boardId}/cards`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            columnId: firstCol.id,
            title: action.data.title,
            description: action.data.description || undefined,
            priority: action.data.priority || "medium",
            due_date: action.data.due_date || undefined,
          }),
        });
        if (!res.ok) throw new Error();
        toast.success("Card created ✨");
        router.refresh();
      } catch {
        toast.error("Failed to create card");
      }
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-background/60 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="mt-[10vh] flex max-h-[80vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Sparkles className="h-4 w-4 text-muted-foreground" />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="flex flex-1 items-center gap-2"
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask AI anything about your boards…"
              disabled={loading}
              className="flex-1 border-0 bg-transparent text-[14px] outline-none placeholder:text-muted-foreground"
            />
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="text-muted-foreground hover:text-foreground disabled:opacity-40"
                aria-label="Send"
              >
                <Send className="h-4 w-4" />
              </button>
            )}
          </form>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {messages.length === 0 ? (
          <div className="p-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Try
            </p>
            <div className="space-y-1">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-[13px] text-foreground transition-colors hover:bg-accent"
                >
                  <span>{s}</span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                </button>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">
              Tip: press{" "}
              <kbd className="rounded bg-muted px-1 py-0.5 text-[10px]">
                ⌘ J
              </kbd>{" "}
              to toggle.
            </p>
          </div>
        ) : (
          <div
            ref={scrollRef}
            className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
          >
            {messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "rounded-lg px-3 py-2 text-[13px] leading-relaxed",
                  m.role === "user"
                    ? "ml-6 bg-accent/60 text-foreground"
                    : "mr-6 bg-muted/50 text-foreground"
                )}
              >
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  {renderMarkdown(m.content)}
                </div>
                {m.action && (
                  <button
                    type="button"
                    onClick={() => performAction(m.action!)}
                    className="mt-2 inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-accent"
                  >
                    <Sparkles className="h-3 w-3" />
                    {m.action.kind === "create_card"
                      ? `Create card: "${m.action.data.title}"`
                      : "Go to board"}
                  </button>
                )}
              </div>
            ))}
            {loading && (
              <div className="mr-6 inline-flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-[13px] text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Thinking…
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function extractBoardId(pathname: string | null): string | undefined {
  if (!pathname) return undefined;
  const m = pathname.match(/\/dashboard\/board\/([^/?#]+)/);
  return m?.[1];
}

function parseAction(text: string): {
  display: string;
  action: ParsedAction | null;
} {
  const createMatch = text.match(/ACTION_CREATE_CARD:\s*(\{[^}]+\})/);
  if (createMatch) {
    try {
      const data = JSON.parse(createMatch[1]);
      const display = text.replace(createMatch[0], "").trim() ||
        `I'll create a card titled "${data.title}".`;
      return { display, action: { kind: "create_card", data } };
    } catch {
      // fall through
    }
  }
  const gotoMatch = text.match(/ACTION_GOTO:\s*(\{[^}]+\})/);
  if (gotoMatch) {
    try {
      const data = JSON.parse(gotoMatch[1]);
      const display = text.replace(gotoMatch[0], "").trim() || "Navigating…";
      return { display, action: { kind: "goto", path: data.path } };
    } catch {
      // fall through
    }
  }
  return { display: text, action: null };
}
