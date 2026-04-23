import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/conversations — list conversations the caller belongs to
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: memberships, error: membershipsError } = await supabase
    .from("conversation_members")
    .select("conversation_id, last_read_at, is_admin")
    .eq("user_id", user.id);

  if (membershipsError) {
    console.error('[conversations GET] memberships query failed:', membershipsError);
    return NextResponse.json({ error: membershipsError.message }, { status: 500 });
  }

  const ids = (memberships ?? []).map((m) => m.conversation_id);
  if (ids.length === 0) return NextResponse.json([]);

  const [convRes, membersRes, lastMsgRes, unreadRes] = await Promise.all([
    supabase
      .from("conversations")
      .select("*")
      .in("id", ids)
      .order("last_message_at", { ascending: false, nullsFirst: false }),
    supabase
      .from("conversation_members")
      .select("conversation_id, user_id, profiles(id, full_name, email, avatar_url)")
      .in("conversation_id", ids),
    supabase
      .from("messages")
      .select("id, conversation_id, sender_id, content, message_type, created_at")
      .in("conversation_id", ids)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("messages")
      .select("conversation_id, sender_id, created_at")
      .in("conversation_id", ids)
      .is("deleted_at", null)
      .neq("sender_id", user.id),
  ]);

  if (convRes.error) {
    console.error('[conversations GET] conversations query failed:', convRes.error);
    return NextResponse.json({ error: convRes.error.message }, { status: 500 });
  }
  if (membersRes.error) {
    console.error('[conversations GET] members query failed:', membersRes.error);
    return NextResponse.json({ error: membersRes.error.message }, { status: 500 });
  }
  if (lastMsgRes.error) {
    console.error('[conversations GET] last messages query failed:', lastMsgRes.error);
    return NextResponse.json({ error: lastMsgRes.error.message }, { status: 500 });
  }
  if (unreadRes.error) {
    console.error('[conversations GET] unread query failed:', unreadRes.error);
    return NextResponse.json({ error: unreadRes.error.message }, { status: 500 });
  }

  const conversations = convRes.data;
  const allMembers = membersRes.data;
  const lastMessages = lastMsgRes.data;

  const lastReadMap = new Map(
    (memberships ?? []).map((m) => [m.conversation_id, m.last_read_at])
  );
  const adminMap = new Map(
    (memberships ?? []).map((m) => [m.conversation_id, !!m.is_admin])
  );
  const membersByConv = new Map<string, Array<{ id: string; full_name: string | null; email: string; avatar_url: string | null }>>();
  for (const m of allMembers ?? []) {
    const arr = membersByConv.get(m.conversation_id) ?? [];
    const p = m.profiles as unknown as { id: string; full_name: string | null; email: string; avatar_url: string | null } | null;
    if (p) arr.push(p);
    membersByConv.set(m.conversation_id, arr);
  }
  const lastMsgByConv = new Map<string, { content: string | null; message_type: string; created_at: string; sender_id: string }>();
  for (const msg of lastMessages ?? []) {
    if (!lastMsgByConv.has(msg.conversation_id)) {
      lastMsgByConv.set(msg.conversation_id, {
        content: msg.content,
        message_type: msg.message_type,
        created_at: msg.created_at,
        sender_id: msg.sender_id,
      });
    }
  }

  const unreadByConv = new Map<string, number>();
  for (const row of unreadRes.data ?? []) {
    const lastRead = lastReadMap.get(row.conversation_id);
    if (lastRead && new Date(row.created_at) <= new Date(lastRead)) continue;
    unreadByConv.set(
      row.conversation_id,
      (unreadByConv.get(row.conversation_id) ?? 0) + 1
    );
  }

  const result = (conversations ?? []).map((c) => {
    const members = membersByConv.get(c.id) ?? [];
    const last = lastMsgByConv.get(c.id) ?? null;
    const unreadCount = unreadByConv.get(c.id) ?? 0;
    return {
      ...c,
      members,
      last_message: last,
      unread_count: unreadCount,
      current_user_is_admin: adminMap.get(c.id) ?? false,
    };
  });

  return NextResponse.json(result);
}

// POST /api/conversations — create or return existing DM/group
// body: { type: 'direct' | 'group', userIds: string[], name?: string }
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const type = body?.type;
  const userIds: string[] = Array.isArray(body?.userIds) ? body.userIds : [];
  const name: string | null =
    typeof body?.name === "string" && body.name.trim() ? body.name.trim() : null;

  if (type !== "direct" && type !== "group") {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }
  const otherIds = userIds.filter((id) => id && id !== user.id);
  if (otherIds.length === 0) {
    return NextResponse.json({ error: "Pick at least one member" }, { status: 400 });
  }

  const convType = type === "group" || otherIds.length > 1 ? "group" : "direct";

  const { data: conversationId, error } = await supabase.rpc("create_conversation", {
    p_type: convType,
    p_name: convType === "group" ? name : null,
    p_member_ids: otherIds,
  });

  if (error || !conversationId) {
    const raw = error?.message || "Failed to create";
    const friendly = /row-level security/i.test(raw)
      ? "You don't have permission to create conversations. Please sign out and back in."
      : raw;
    return NextResponse.json({ error: friendly }, { status: 500 });
  }

  return NextResponse.json({ id: conversationId });
}
