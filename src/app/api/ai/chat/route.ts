import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  AIError,
  aiConfigured,
  aiErrorResponse,
  completeAI,
} from "@/lib/ai/client";
import { CHAT_SYSTEM } from "@/lib/ai/chat-prompt";

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const {
    messages,
    boardId,
  }: { messages: ChatMsg[]; boardId?: string } = await request.json();

  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 50 ||
      messages.some((m) => !m || !["user", "assistant"].includes(m.role) || typeof m.content !== "string" || m.content.length > 10000)) {
    return NextResponse.json({ error: "Missing messages" }, { status: 400 });
  }

  if (!aiConfigured()) {
    const err = new AIError(
      "AI features are currently unavailable.",
      "not_configured",
      503
    );
    const { status, body } = aiErrorResponse(err);
    return NextResponse.json(body, { status });
  }

  let boardName: string | null = null;
  let boardStats = "";
  if (boardId) {
    const { data: board, error: boardError } = await supabase
      .from("boards")
      .select("name")
      .eq("id", boardId)
      .maybeSingle();
    if (boardError) {
      console.error('[ai/chat POST] board lookup failed:', boardError);
      return NextResponse.json({ error: boardError.message }, { status: 500 });
    }
    boardName = board?.name ?? null;

    const { data: cards, error: cardsError } = await supabase
      .from("cards")
      .select("id, title, priority, due_date, column_id, assignee_id")
      .eq("board_id", boardId);
    if (cardsError) {
      console.error('[ai/chat POST] cards query failed:', cardsError);
      return NextResponse.json({ error: cardsError.message }, { status: 500 });
    }

    const { data: columns, error: columnsError } = await supabase
      .from("columns")
      .select("id, name")
      .eq("board_id", boardId);
    if (columnsError) {
      console.error('[ai/chat POST] columns query failed:', columnsError);
      return NextResponse.json({ error: columnsError.message }, { status: 500 });
    }
    const colMap = new Map((columns ?? []).map((c) => [c.id, c.name]));
    const now = new Date();
    const overdue = (cards ?? []).filter(
      (c) => c.due_date && new Date(c.due_date) < now
    ).length;

    boardStats = `Cards: ${cards?.length ?? 0}, Overdue: ${overdue}, Columns: ${(
      columns ?? []
    )
      .map((c) => c.name)
      .join(", ")}. Recent cards: ${(cards ?? [])
      .slice(0, 20)
      .map(
        (c) =>
          `"${c.title}" (${c.priority}, ${colMap.get(c.column_id) ?? "?"})`
      )
      .join("; ")}`;
  }

  try {
    const text = await completeAI({
      userId: user.id,
      feature: "chat",
      maxTokens: 1024,
      messages: [
        {
          role: "system",
          content: CHAT_SYSTEM({
            boardName,
            boardStats,
            today: new Date().toISOString().slice(0, 10),
          }),
        },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    });

    return NextResponse.json({ text });
  } catch (err: unknown) {
    const { status, body } = aiErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
