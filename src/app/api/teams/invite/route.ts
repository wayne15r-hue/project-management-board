import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { inviteSchema } from "@/lib/validators/team";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  // Check existing invite
  const { data: existing } = await supabase
    .from("invites")
    .select("id")
    .eq("team_id", parsed.data.teamId)
    .eq("email", parsed.data.email)
    .eq("status", "pending")
    .single();

  if (existing) {
    return NextResponse.json(
      { error: "Invite already sent to this email" },
      { status: 409 }
    );
  }

  // Check if already a member
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", parsed.data.email)
    .single();

  if (profile) {
    const { data: member } = await supabase
      .from("team_members")
      .select("id")
      .eq("team_id", parsed.data.teamId)
      .eq("user_id", profile.id)
      .single();

    if (member) {
      return NextResponse.json(
        { error: "User is already a team member" },
        { status: 409 }
      );
    }
  }

  const { data: invite, error } = await supabase
    .from("invites")
    .insert({
      team_id: parsed.data.teamId,
      email: parsed.data.email,
      invited_by: user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Send invite email (fire-and-forget)
  import("@/lib/email").then(async ({ sendTeamInviteEmail }) => {
    try {
      const { data: team } = await supabase
        .from("teams")
        .select("name")
        .eq("id", parsed.data.teamId)
        .single();

      const { data: inviterProfile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .single();

      await sendTeamInviteEmail({
        to: parsed.data.email,
        teamName: team?.name || "a team",
        inviterName: inviterProfile?.full_name || "A teammate",
        inviteToken: invite.token,
      });
    } catch (emailError) {
      console.error("Failed to send invite email:", emailError);
    }
  });

  return NextResponse.json(invite, { status: 201 });
}
