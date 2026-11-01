import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { acceptInviteSchema } from "@/lib/validators/team";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = acceptInviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  const { data: teamId, error } = await supabase.rpc("accept_team_invite", {
    p_token: parsed.data.token,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, {
      status: error.code === "42501" ? 403 : error.code === "22023" ? 410 : 500,
    });
  }
  return NextResponse.json({ success: true, teamId });
}
