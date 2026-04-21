import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/conversations/[id]/messages?before=ISO&limit=50
export async function GET(
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

  const url = new URL(request.url);
  const before = url.searchParams.get("before");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 100);

  let query = supabase
    .from("messages")
    .select(
      "id, conversation_id, sender_id, content, message_type, file_url, file_name, file_size, file_type, reply_to_id, edited_at, deleted_at, created_at, sender:profiles!messages_sender_id_fkey(id, full_name, email, avatar_url)"
    )
    .eq("conversation_id", conversationId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (before) query = query.lt("created_at", before);

  const { data, error } = await query;
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json((data ?? []).reverse());
}

// POST /api/conversations/[id]/messages
// body: { content?: string, message_type?: string, file_url?, file_name?, file_size?, file_type?, reply_to_id? }
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

  const body = await request.json();
  const content =
    typeof body?.content === "string" ? body.content.trim() : "";
  const messageType =
    typeof body?.message_type === "string" ? body.message_type : "text";

  if (!content && messageType === "text") {
    return NextResponse.json({ error: "Empty message" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_id: user.id,
      content: content || null,
      message_type: messageType,
      file_url: body?.file_url ?? null,
      file_name: body?.file_name ?? null,
      file_size: body?.file_size ?? null,
      file_type: body?.file_type ?? null,
      reply_to_id: body?.reply_to_id ?? null,
    })
    .select(
      "id, conversation_id, sender_id, content, message_type, file_url, file_name, file_size, file_type, reply_to_id, edited_at, created_at, sender:profiles!messages_sender_id_fkey(id, full_name, email, avatar_url)"
    )
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase
    .from("conversation_members")
    .update({ last_read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .eq("user_id", user.id);

  return NextResponse.json(data);
}
