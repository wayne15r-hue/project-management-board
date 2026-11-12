import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { askClaude, aiErrorResponse } from "@/lib/ai/client";
import { SUGGEST_SYSTEM } from "@/lib/ai/prompts";
import { workflowErrorResponse } from "@/lib/workflows/errors";
import type { BoardSharing } from "@/types";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { cardId, title, description, boardId } = await request.json();
  if (!title || typeof title !== "string") {
    return NextResponse.json({ error: "Missing title" }, { status: 400 });
  }
  if (!boardId) {
    return NextResponse.json({ error: "Missing boardId" }, { status: 400 });
  }

  const [{ data: labels }, { data: sharing, error: sharingError }] = await Promise.all([
    supabase.from("labels").select("name").eq("board_id", boardId),
    supabase.rpc("board_share_context", { p_board: boardId }),
  ]);

  const labelNames = (labels ?? []).map((l) => l.name);
  if (sharingError) return workflowErrorResponse(sharingError);
  const { members, pendingCount } = sharing as BoardSharing;
  const memberNames = pendingCount ? [] : members.slice(0, 50).map((member) => member.full_name || member.email);

  const systemPrompt = SUGGEST_SYSTEM({
    labels: labelNames,
    members: memberNames,
  });

  try {
    const text = await askClaude({
      userId: user.id,
      systemPrompt,
      userMessage: `Title: ${title}\nDescription: ${description || "(none)"}\nCard id: ${cardId ?? "(new)"}`,
      feature: "suggest",
      maxTokens: 300,
      json: true,
    });
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return NextResponse.json({ priority: null, labels: [], assignee_name: null });
    }
    return NextResponse.json(parsed);
  } catch (err) {
    const { status, body } = aiErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
