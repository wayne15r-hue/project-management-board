import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { askClaude, aiErrorResponse } from "@/lib/ai/client";
import { ENHANCE_TEXT_SYSTEM, enhanceUserMessage } from "@/lib/ai/prompts";

const VALID_ACTIONS = [
  "improve",
  "shorter",
  "longer",
  "generate",
  "acceptance_criteria",
] as const;
type Action = (typeof VALID_ACTIONS)[number];

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { action, text, title } = await request.json();
  if (!VALID_ACTIONS.includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
  if (typeof title !== "string") {
    return NextResponse.json({ error: "Missing title" }, { status: 400 });
  }

  try {
    const result = await askClaude({
      userId: user.id,
      systemPrompt: ENHANCE_TEXT_SYSTEM,
      userMessage: enhanceUserMessage({
        action: action as Action,
        text: text ?? "",
        title,
      }),
      feature: `enhance_${action}`,
      maxTokens: 1024,
    });
    return NextResponse.json({ text: result.trim() });
  } catch (err) {
    const { status, body } = aiErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
