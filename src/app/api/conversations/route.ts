import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { conversationCreation, groupErrorStatus, groupName } from './group-validation';

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

  const [convRes, membersRes, summariesRes] = await Promise.all([
    supabase.from("conversations").select("*").in("id", ids)
      .order("last_message_at", { ascending: false, nullsFirst: false }),
    supabase.from("conversation_members")
      .select("conversation_id, user_id, profiles(id, full_name, email, avatar_url)").in("conversation_id", ids),
    supabase.rpc("conversation_summaries"),
  ]);
  const error = convRes.error || membersRes.error || summariesRes.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  type Profile = { id: string; full_name: string | null; email: string; avatar_url: string | null };
  type Summary = { conversation_id: string; last_message: unknown; unread_count: number | string };
  const summaries = new Map<string, Summary>((summariesRes.data ?? []).map((summary: Summary) => [summary.conversation_id, summary]));
  const admins = new Map((memberships ?? []).map((m) => [m.conversation_id, !!m.is_admin]));
  const members = new Map<string, Profile[]>();
  for (const membership of membersRes.data ?? []) {
    const profile = membership.profiles as unknown as Profile | null;
    if (profile) members.set(membership.conversation_id, [...(members.get(membership.conversation_id) ?? []), profile]);
  }
  return NextResponse.json((convRes.data ?? []).map((conversation) => ({
    ...conversation,
    members: members.get(conversation.id) ?? [],
    last_message: summaries.get(conversation.id)?.last_message ?? null,
    unread_count: Number(summaries.get(conversation.id)?.unread_count ?? 0),
    current_user_is_admin: admins.get(conversation.id) ?? false,
  })));
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

  const parsed = conversationCreation.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Select 1–49 members with valid user IDs and a valid conversation type.' }, { status: 400 });
  const { type, userIds, name } = parsed.data;
  const otherIds = [...new Set(userIds.filter((id) => id !== user.id))];
  if (otherIds.length === 0) {
    return NextResponse.json({ error: "Pick at least one member" }, { status: 400 });
  }

  const convType = type === "group" || otherIds.length > 1 ? "group" : "direct";
  const parsedName = groupName.safeParse(name);
  if (convType === 'group' && !parsedName.success) return NextResponse.json({ error: 'Group name must contain 1–100 characters.' }, { status: 400 });

  const { data: conversationId, error } = await supabase.rpc("create_conversation", {
    p_type: convType,
    p_name: convType === "group" && parsedName.success ? parsedName.data : null,
    p_member_ids: otherIds,
  });

  if (error || !conversationId) {
    const raw = error?.message || "Failed to create";
    const friendly = /row-level security/i.test(raw)
      ? "You don't have permission to create conversations. Please sign out and back in."
      : raw;
    return NextResponse.json({ error: friendly }, { status: groupErrorStatus(error?.code) });
  }

  return NextResponse.json({ id: conversationId });
}
