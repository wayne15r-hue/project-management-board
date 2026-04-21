import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { askClaude, aiErrorResponse } from "@/lib/ai/client";
import { PARSE_CARD_SYSTEM } from "@/lib/ai/prompts";

type RawCard = {
  title?: unknown;
  description?: unknown;
  priority?: unknown;
  due_date?: unknown;
  assignee_name?: unknown;
  labels?: unknown;
  column?: unknown;
};

function extractJSON(text: string): RawCard | null {
  if (!text || typeof text !== "string") return null;
  const cleaned = text.replace(/```json\s*|\s*```/g, "").trim();
  try {
    return JSON.parse(cleaned) as RawCard;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]) as RawCard;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function normalizeCardData(raw: RawCard | null) {
  if (!raw || typeof raw !== "object") return null;
  const priority =
    raw.priority === "low" || raw.priority === "medium" || raw.priority === "high"
      ? raw.priority
      : "medium";
  const dueDate =
    typeof raw.due_date === "string" && !isNaN(Date.parse(raw.due_date))
      ? raw.due_date
      : null;
  return {
    title:
      typeof raw.title === "string" && raw.title.trim()
        ? raw.title.trim()
        : "Untitled Task",
    description:
      typeof raw.description === "string" ? raw.description.trim() : "",
    priority,
    due_date: dueDate,
    assignee_name:
      typeof raw.assignee_name === "string" && raw.assignee_name.trim()
        ? raw.assignee_name.trim()
        : null,
    labels: Array.isArray(raw.labels)
      ? raw.labels.filter((l): l is string => typeof l === "string")
      : [],
    column:
      typeof raw.column === "string" && raw.column.trim()
        ? raw.column.trim()
        : null,
  };
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { description, boardId } = await request.json();
  if (!description || typeof description !== "string" || !description.trim()) {
    return NextResponse.json(
      {
        error:
          "Couldn't understand that. Try rephrasing, like: 'Fix login bug, high priority, due Friday'",
      },
      { status: 400 }
    );
  }
  if (!boardId) {
    return NextResponse.json({ error: "Missing boardId" }, { status: 400 });
  }

  const [{ data: cols }, { data: labels }, { data: members }, { data: profile }] =
    await Promise.all([
      supabase
        .from("columns")
        .select("name")
        .eq("board_id", boardId)
        .order("position"),
      supabase.from("labels").select("name, color").eq("board_id", boardId),
      supabase
        .from("profiles")
        .select("full_name, email")
        .limit(50),
      supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", user.id)
        .single(),
    ]);

  const memberNames = (members ?? [])
    .map((m) => m.full_name || m.email)
    .filter(Boolean) as string[];
  const currentUserName =
    profile?.full_name || profile?.email || "current user";

  const systemPrompt = PARSE_CARD_SYSTEM({
    columns: (cols ?? []).map((c) => c.name),
    labels: (labels ?? []).map((l) => ({ name: l.name, color: l.color })),
    members: memberNames,
    today: new Date().toISOString().slice(0, 10),
    currentUserName,
  });

  try {
    const text = await askClaude({
      userId: user.id,
      systemPrompt,
      userMessage: description,
      feature: "parse_card",
      maxTokens: 512,
      json: true,
    });
    const raw = extractJSON(text);
    const normalized = normalizeCardData(raw);
    if (!normalized) {
      return NextResponse.json(
        {
          error:
            "Couldn't understand that. Try rephrasing, like: 'Fix login bug, high priority, due Friday'",
        },
        { status: 502 }
      );
    }
    return NextResponse.json(normalized);
  } catch (err) {
    const { status, body } = aiErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
