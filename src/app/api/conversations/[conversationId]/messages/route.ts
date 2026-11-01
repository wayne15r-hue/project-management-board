import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { signChatFile, parseMessageCursor, messagePageLimit } from "../../chat-files";

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
  const messageId = url.searchParams.get("message_id");
  if (messageId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(messageId)) {
    return NextResponse.json({ error: "Invalid message id" }, { status: 400 });
  }
  let cursor: ReturnType<typeof parseMessageCursor>;
  let limit: number;
  const forward = url.searchParams.has("after") || url.searchParams.has("after_id");
  try {
    if (forward && (url.searchParams.has("before") || url.searchParams.has("before_id") || messageId || !url.searchParams.get("after_id"))) throw new Error("Ambiguous cursor");
    cursor = forward
      ? parseMessageCursor(url.searchParams.get("after"), url.searchParams.get("after_id"))
      : parseMessageCursor(url.searchParams.get("before"), url.searchParams.get("before_id"));
    limit = messagePageLimit(url.searchParams.get("limit"));
  } catch {
    return NextResponse.json({ error: "Invalid message pagination" }, { status: 400 });
  }
  const { data: member, error: membershipError } = await supabase.rpc("is_conversation_member", { conv_id: conversationId });
  if (membershipError) return NextResponse.json({ error: "Membership check failed" }, { status: 500 });
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let query = supabase
    .from("messages")
    .select(
      "id, conversation_id, sender_id, content, message_type, file_url, file_name, file_size, file_type, reply_to_id, edited_at, deleted_at, created_at, sender:profiles!messages_sender_id_fkey(id, full_name, email, avatar_url)"
    )
    .eq("conversation_id", conversationId)
    .is("deleted_at", null)
    .order("created_at", { ascending: forward })
    .order("id", { ascending: forward })
    .limit(limit);
  if (messageId) query = query.eq("id", messageId);
  if (cursor?.beforeId) {
    const comparison = forward ? "gt" : "lt";
    query = query.or(`created_at.${comparison}.${cursor.before},and(created_at.eq.${cursor.before},id.${comparison}.${cursor.beforeId})`);
  } else if (cursor) query = query.lt("created_at", cursor.before);

  const { data, error } = await query;
  if (error) {
    console.error('[conversations/[conversationId]/messages GET] query failed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const messages = forward ? (data ?? []) : (data ?? []).reverse();
  const ids = messages.map((m) => m.id);
  if (ids.length === 0) return NextResponse.json(messages);

  const { data: reactions, error: rxError } = await supabase
    .from("message_reactions")
    .select("message_id, user_id, emoji")
    .in("message_id", ids);
  if (rxError) {
    console.error('[conversations/[conversationId]/messages GET] reactions query failed:', rxError);
    return NextResponse.json({ error: rxError.message }, { status: 500 });
  }

  const rxMap = new Map<string, Map<string, Set<string>>>();
  for (const r of reactions ?? []) {
    const perMsg = rxMap.get(r.message_id) ?? new Map<string, Set<string>>();
    const users = perMsg.get(r.emoji) ?? new Set<string>();
    users.add(r.user_id);
    perMsg.set(r.emoji, users);
    rxMap.set(r.message_id, perMsg);
  }
  const withRx = messages.map((m) => {
    const perMsg = rxMap.get(m.id);
    const rx = perMsg
      ? Array.from(perMsg.entries()).map(([emoji, users]) => ({
          emoji,
          count: users.size,
          user_ids: Array.from(users),
        }))
      : [];
    return { ...m, reactions: rx };
  });

  try {
    return NextResponse.json(await Promise.all(withRx.map((message) => signChatFile(supabase, conversationId, message))));
  } catch {
    return NextResponse.json({ error: "Could not refresh chat attachment links" }, { status: 502 });
  }
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

  const body = await request.json().catch(() => null);
  if (!body || (body.message_type && body.message_type !== "text") || body.file_url) {
    return NextResponse.json({ error: "Use the upload endpoint for attachments" }, { status: 400 });
  }
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
