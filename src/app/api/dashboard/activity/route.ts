import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("activity_log")
    .select(
      `id, action, changes, created_at, card_id, actor_id,
       actor:profiles!activity_log_actor_id_fkey(id, full_name, avatar_url, email),
       card:cards!activity_log_card_id_fkey(id, title, board_id)`
    )
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ items: data ?? [] });
}
