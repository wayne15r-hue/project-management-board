import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  AI_MODEL,
  AIError,
  aiConfigured,
  aiErrorResponse,
  getGroqClient,
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

  if (!Array.isArray(messages) || messages.length === 0) {
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

  // Daily limit check
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const { count, error: usageError } = await supabase
    .from("ai_usage")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", since.toISOString());
  if (usageError) {
    console.error('[ai/chat POST] usage count query failed:', usageError);
    return NextResponse.json({ error: usageError.message }, { status: 500 });
  }
  if ((count ?? 0) >= 50) {
    return NextResponse.json(
      { error: "Daily AI limit reached. Resets tomorrow.", code: "daily_limit" },
      { status: 429 }
    );
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
    const client = getGroqClient();
    const response = await client.chat.completions.create({
      model: AI_MODEL,
      max_tokens: 1024,
      temperature: 0.7,
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

    try {
      await supabase.from("ai_usage").insert({
        user_id: user.id,
        feature: "chat",
        input_tokens: response.usage?.prompt_tokens ?? 0,
        output_tokens: response.usage?.completion_tokens ?? 0,
        model: AI_MODEL,
      });
    } catch {
      /* ignore */
    }

    const text = response.choices[0]?.message?.content ?? "";
    return NextResponse.json({ text });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    if (e?.status === 429) {
      return NextResponse.json(
        {
          error: "The AI service is rate-limited. Try again shortly.",
          code: "rate_limited",
        },
        { status: 429 }
      );
    }
    return NextResponse.json(
      { error: e?.message || "Chat failed", code: "unknown" },
      { status: 500 }
    );
  }
}
