import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { AI_MODEL, aiConfigured, askAI, aiErrorResponse } from "@/lib/ai/client";

export async function GET() {
  return handle();
}

export async function POST() {
  return handle();
}

async function handle() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!aiConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        configured: false,
        error: "AI features are currently unavailable.",
      },
      { status: 503 }
    );
  }

  try {
    await askAI({
      userId: user.id, feature: "test", systemPrompt: "Reply briefly.",
      userMessage: "ping", maxTokens: 8,
    });
    return NextResponse.json({ ok: true, configured: true, model: AI_MODEL });
  } catch (err: unknown) {
    const { status, body } = aiErrorResponse(err);
    return NextResponse.json(
      { ok: false, configured: true, ...body },
      { status }
    );
  }
}
