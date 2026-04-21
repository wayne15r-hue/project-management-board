import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { askClaude, aiErrorResponse } from "@/lib/ai/client";
import { EXTRACT_TASKS_SYSTEM } from "@/lib/ai/prompts";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { notes } = await request.json();
  if (!notes || typeof notes !== "string") {
    return NextResponse.json({ error: "Missing notes" }, { status: 400 });
  }

  try {
    const text = await askClaude({
      userId: user.id,
      systemPrompt: EXTRACT_TASKS_SYSTEM,
      userMessage: notes,
      feature: "extract_tasks",
      maxTokens: 2048,
      json: true,
    });
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { error: "AI returned an unparseable response." },
        { status: 502 }
      );
    }
    return NextResponse.json({ tasks: parsed.tasks ?? [] });
  } catch (err) {
    const { status, body } = aiErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
