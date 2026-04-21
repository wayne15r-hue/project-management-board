import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [boardsRes, cardsRes, membersRes] = await Promise.all([
    supabase.from("boards").select("id", { count: "exact", head: true }),
    supabase
      .from("cards")
      .select("id, due_date", { count: "exact" }),
    supabase.from("team_members").select("user_id"),
  ]);

  if (boardsRes.error) {
    console.error('[dashboard/stats GET] boards count failed:', boardsRes.error);
    return NextResponse.json({ error: boardsRes.error.message }, { status: 500 });
  }
  if (cardsRes.error) {
    console.error('[dashboard/stats GET] cards query failed:', cardsRes.error);
    return NextResponse.json({ error: cardsRes.error.message }, { status: 500 });
  }
  if (membersRes.error) {
    console.error('[dashboard/stats GET] team members query failed:', membersRes.error);
    return NextResponse.json({ error: membersRes.error.message }, { status: 500 });
  }

  const totalBoards = boardsRes.count ?? 0;
  const totalCards = cardsRes.count ?? 0;

  const now = new Date();
  const weekFromNow = new Date(now);
  weekFromNow.setDate(now.getDate() + 7);

  let dueThisWeek = 0;
  let overdue = 0;
  (cardsRes.data ?? []).forEach((c) => {
    if (!c.due_date) return;
    const d = new Date(c.due_date);
    if (d < now) overdue++;
    if (d >= now && d <= weekFromNow) dueThisWeek++;
  });

  const memberIds = new Set<string>();
  (membersRes.data ?? []).forEach((m) => memberIds.add(m.user_id));
  memberIds.add(user.id);

  return NextResponse.json({
    totalBoards,
    totalCards,
    dueThisWeek,
    overdue,
    teamMembers: memberIds.size,
  });
}
