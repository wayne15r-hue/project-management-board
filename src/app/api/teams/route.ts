import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createTeamSchema } from "@/lib/validators/team";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("team_members")
    .select("team_id, role, teams(id, name, created_at, created_by)")
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const teams = data?.map((tm) => ({
    ...(tm.teams as unknown as Record<string, unknown>),
    role: tm.role,
  }));

  return NextResponse.json(teams || []);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = createTeamSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  const { data: teamId, error: createError } = await supabase.rpc("create_team", {
    p_name: parsed.data.name,
  });
  if (createError) return NextResponse.json({ error: createError.message }, { status: 500 });
  const { data: team, error: teamError } = await supabase.from("teams").select("*").eq("id", teamId).single();
  if (teamError) return NextResponse.json({ error: teamError.message }, { status: 500 });

  return NextResponse.json(team, { status: 201 });
}
