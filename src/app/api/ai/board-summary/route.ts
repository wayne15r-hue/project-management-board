import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { askClaude, aiErrorResponse } from "@/lib/ai/client";
import { BOARD_SUMMARY_SYSTEM } from "@/lib/ai/prompts";

type Timeframe = "today" | "week" | "month" | "all";
type SummaryType = "digest" | "standup" | "health";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const {
    boardId,
    timeframe = "week",
    type = "digest",
  }: { boardId: string; timeframe: Timeframe; type: SummaryType } =
    await request.json();

  if (!boardId) {
    return NextResponse.json({ error: "Missing boardId" }, { status: 400 });
  }

  const since = timeframeToDate(timeframe);

  const [columnsRes, cardsRes, activityRes] = await Promise.all([
    supabase
      .from("columns")
      .select("id, name, position")
      .eq("board_id", boardId)
      .order("position"),
    supabase
      .from("cards")
      .select(
        "id, title, priority, column_id, due_date, created_at, updated_at, assignee:profiles!cards_assignee_id_fkey(full_name, email)"
      )
      .eq("board_id", boardId),
    since
      ? supabase
          .from("activity_log")
          .select(
            "action, changes, created_at, card_id, actor:profiles!activity_log_actor_id_fkey(full_name, email)"
          )
          .in(
            "card_id",
            (
              await supabase
                .from("cards")
                .select("id")
                .eq("board_id", boardId)
            ).data?.map((c) => c.id) ?? []
          )
          .gte("created_at", since.toISOString())
          .order("created_at", { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [] as unknown[], error: null }),
  ]);

  if (columnsRes.error) {
    console.error('[ai/board-summary POST] columns query failed:', columnsRes.error);
    return NextResponse.json({ error: columnsRes.error.message }, { status: 500 });
  }
  if (cardsRes.error) {
    console.error('[ai/board-summary POST] cards query failed:', cardsRes.error);
    return NextResponse.json({ error: cardsRes.error.message }, { status: 500 });
  }
  if ("error" in activityRes && activityRes.error) {
    console.error('[ai/board-summary POST] activity query failed:', activityRes.error);
    return NextResponse.json({ error: activityRes.error.message }, { status: 500 });
  }

  const columns = columnsRes.data;
  const cards = cardsRes.data;
  const activity = activityRes.data;

  const colMap = new Map((columns ?? []).map((c) => [c.id, c.name]));
  const now = new Date();
  const overdue = (cards ?? []).filter(
    (c) => c.due_date && new Date(c.due_date) < now
  );
  const byColumn = (columns ?? []).map((col) => ({
    column: col.name,
    cards: (cards ?? []).filter((c) => c.column_id === col.id).length,
  }));
  const byPriority = {
    high: (cards ?? []).filter((c) => c.priority === "high").length,
    medium: (cards ?? []).filter((c) => c.priority === "medium").length,
    low: (cards ?? []).filter((c) => c.priority === "low").length,
  };

  type AssigneeRel = { full_name: string | null; email: string } | null;
  type ActorRel = AssigneeRel;

  const userMessage = buildUserMessage({
    type,
    timeframe,
    totalCards: cards?.length ?? 0,
    byColumn,
    byPriority,
    overdueSample: overdue.slice(0, 10).map((c) => ({
      title: c.title,
      due: c.due_date,
      assignee:
        (c.assignee as unknown as AssigneeRel)?.full_name ||
        (c.assignee as unknown as AssigneeRel)?.email ||
        null,
    })),
    recentActivity: (activity ?? []).slice(0, 40).map((a) => {
      const row = a as {
        action: string;
        changes: unknown;
        created_at: string;
        card_id: string;
        actor: unknown;
      };
      return {
        action: row.action,
        actor:
          (row.actor as ActorRel)?.full_name ||
          (row.actor as ActorRel)?.email ||
          "unknown",
        column: colMap.get(row.card_id) ?? null,
        changes: row.changes,
        at: row.created_at,
      };
    }),
    userName: user.email || "you",
  });

  try {
    const text = await askClaude({
      userId: user.id,
      systemPrompt: BOARD_SUMMARY_SYSTEM,
      userMessage,
      feature: `summary_${type}`,
      maxTokens: 1500,
    });
    return NextResponse.json({ text });
  } catch (err) {
    const { status, body } = aiErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}

function timeframeToDate(tf: Timeframe): Date | null {
  const now = new Date();
  if (tf === "today") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (tf === "week") {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return d;
  }
  if (tf === "month") {
    const d = new Date(now);
    d.setDate(d.getDate() - 30);
    return d;
  }
  return null;
}

function buildUserMessage(ctx: {
  type: SummaryType;
  timeframe: Timeframe;
  totalCards: number;
  byColumn: { column: string; cards: number }[];
  byPriority: { high: number; medium: number; low: number };
  overdueSample: {
    title: string;
    due: string | null;
    assignee: string | null;
  }[];
  recentActivity: {
    action: string;
    actor: string;
    column: string | null;
    changes: unknown;
    at: string;
  }[];
  userName: string;
}) {
  const header =
    ctx.type === "standup"
      ? `Generate a standup update for ${ctx.userName} based on recent activity.`
      : ctx.type === "health"
      ? `Generate a board health check: identify bottlenecks, overloaded members, stale cards, priority imbalance.`
      : `Generate a ${ctx.timeframe} digest of what happened on this board.`;

  return `${header}

Board stats:
- Total cards: ${ctx.totalCards}
- By column: ${ctx.byColumn.map((c) => `${c.column}=${c.cards}`).join(", ")}
- By priority: high=${ctx.byPriority.high}, medium=${ctx.byPriority.medium}, low=${ctx.byPriority.low}
- Overdue: ${ctx.overdueSample.length}

Overdue cards:
${ctx.overdueSample
  .map(
    (c) =>
      `- ${c.title} (due ${c.due ?? "?"}, assigned to ${c.assignee ?? "nobody"})`
  )
  .join("\n") || "(none)"}

Recent activity (${ctx.recentActivity.length} events):
${ctx.recentActivity
  .slice(0, 30)
  .map(
    (a) =>
      `- ${a.actor} ${a.action}${a.column ? ` (${a.column})` : ""} — ${JSON.stringify(a.changes)}`
  )
  .join("\n") || "(no activity)"}`;
}
