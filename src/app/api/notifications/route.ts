import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("notifications")
    .select(
      `id, recipient_id, actor_id, type, card_id, board_id, activity_log_id,
       title, body, read_at, created_at,
       actor:profiles!notifications_actor_id_fkey(id, full_name, avatar_url, email)`
    )
    .eq("recipient_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[notifications GET] query failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const cardIds = Array.from(
    new Set((data ?? []).map((n) => n.card_id).filter(Boolean) as string[])
  );
  const cardTitleMap = new Map<string, string>();
  if (cardIds.length > 0) {
    const { data: cards, error: cardsError } = await supabase
      .from("cards")
      .select("id, title")
      .in("id", cardIds);
    if (cardsError) {
      console.error("[notifications GET] cards query failed:", cardsError);
      return NextResponse.json(
        { error: cardsError.message },
        { status: 500 }
      );
    }
    for (const c of cards ?? []) cardTitleMap.set(c.id, c.title);
  }

  const notifications = (data ?? []).map((n) => ({
    ...n,
    card_title: n.card_id ? cardTitleMap.get(n.card_id) ?? null : null,
  }));

  const { count, error: countError } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("recipient_id", user.id)
    .is("read_at", null);

  if (countError) {
    console.error("[notifications GET] unread count failed:", countError);
    return NextResponse.json({ error: countError.message }, { status: 500 });
  }

  return NextResponse.json({
    notifications,
    unread_count: count ?? 0,
  });
}
