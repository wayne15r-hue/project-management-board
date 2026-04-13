import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const { teamId } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("teams")
    .select(
      `
      *,
      team_members (
        id, user_id, role, joined_at,
        profile:profiles (id, full_name, avatar_url, email)
      )
    `
    )
    .eq("id", teamId)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}
