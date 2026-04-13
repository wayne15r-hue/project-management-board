import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ cardId: string }> }
) {
  const { cardId } = await params;
  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get("cursor");
  const limit = Math.min(Number(searchParams.get("limit") || 20), 50);

  const supabase = await createClient();

  let query = supabase
    .from("activity_log")
    .select("*, actor:profiles!activity_log_actor_id_fkey(id, full_name, avatar_url, email)")
    .eq("card_id", cardId)
    .order("created_at", { ascending: false })
    .limit(limit + 1);

  if (cursor) {
    query = query.lt("created_at", cursor);
  }

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const hasMore = data && data.length > limit;
  const items = hasMore ? data.slice(0, limit) : data || [];
  const nextCursor = hasMore ? items[items.length - 1].created_at : null;

  return NextResponse.json({ items, nextCursor });
}
