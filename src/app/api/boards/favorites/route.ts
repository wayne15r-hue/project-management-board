import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("board_favorites")
    .select("board_id")
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ boardIds: (data ?? []).map((r) => r.board_id) });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { boardId, favorite } = await request.json();
  if (typeof boardId !== "string") {
    return NextResponse.json({ error: "boardId required" }, { status: 400 });
  }

  if (favorite) {
    const { error } = await supabase
      .from("board_favorites")
      .upsert({ user_id: user.id, board_id: boardId });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await supabase
      .from("board_favorites")
      .delete()
      .eq("user_id", user.id)
      .eq("board_id", boardId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
