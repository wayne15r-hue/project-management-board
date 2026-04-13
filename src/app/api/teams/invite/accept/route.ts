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

  // Find the invite
  const { data: invite, error: findError } = await supabase
    .from("invites")
    .select("*")
    .eq("token", parsed.data.token)
    .eq("status", "pending")
    .single();

  if (findError || !invite) {
    return NextResponse.json(
      { error: "Invalid or expired invitation" },
      { status: 404 }
    );
  }

  // Check if expired
  if (new Date(invite.expires_at) < new Date()) {
    await supabase
      .from("invites")
      .update({ status: "expired" })
      .eq("id", invite.id);
    return NextResponse.json(
      { error: "Invitation has expired" },
      { status: 410 }
    );
  }

  // Add user to team
  const { error: memberError } = await supabase
    .from("team_members")
    .insert({
      team_id: invite.team_id,
      user_id: user.id,
      role: "member",
    });

  if (memberError) {
    if (memberError.code === "23505") {
      return NextResponse.json(
        { error: "You're already a member of this team" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: memberError.message }, { status: 500 });
  }

  // Mark invite as accepted
  await supabase
    .from("invites")
    .update({ status: "accepted" })
    .eq("id", invite.id);

  return NextResponse.json({ success: true, teamId: invite.team_id });
}
