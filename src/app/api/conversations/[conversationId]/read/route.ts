import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// POST /api/conversations/[id]/read — mark conversation read
export async function POST(
  request: Request,
  ctx: { params: Promise<{ conversationId: string }> }
) {
  const { conversationId } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const messageId = body?.message_id;
  if (messageId != null && (typeof messageId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(messageId))) {
    return NextResponse.json({ error: "Invalid message" }, { status: 400 });
  }
  const { error } = await supabase.rpc("mark_conversation_read", {
    p_conversation_id: conversationId, p_message_id: messageId ?? null,
  });

  if (error)
    return NextResponse.json({ error: error.message }, { status: error.code === "42501" ? 403 : error.code === "22023" ? 400 : 500 });
  return NextResponse.json({ ok: true });
}
