import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { AI_MODEL, aiConfigured, getGroqClient } from "@/lib/ai/client";

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
    const client = getGroqClient();
    await client.chat.completions.create({
      model: AI_MODEL,
      max_tokens: 8,
      messages: [{ role: "user", content: "ping" }],
    });
    return NextResponse.json({ ok: true, configured: true, model: AI_MODEL });
  } catch (err: unknown) {
    const e = err as { message?: string };
    return NextResponse.json(
      { ok: false, configured: true, error: e?.message || "AI test failed." },
      { status: 502 }
    );
  }
}
