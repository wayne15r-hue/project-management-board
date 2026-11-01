import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { inviteSchema } from "@/lib/validators/team";
import type { Invite } from "@/types";

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

  const { data: invite, error } = await supabase.rpc("invite_team_member", {
    p_team_id: parsed.data.teamId,
    p_email: parsed.data.email,
  }).single<Invite>();
  if (error) return NextResponse.json({ error: error.message }, {
    status: error.code === "42501" ? 403 : error.code === "23505" ? 409 : error.code === "22023" ? 400 : 500,
  });

  let emailSent = false;
  try {
    const { sendTeamInviteEmail } = await import("@/lib/email");
    const { data: team, error: teamError } = await supabase
      .from("teams").select("name").eq("id", parsed.data.teamId).single();
    const { data: inviterProfile, error: profileError } = await supabase
      .from("profiles").select("full_name").eq("id", user.id).single();
    if (teamError || profileError) throw new Error("Unable to prepare invitation email");
    await sendTeamInviteEmail({
      to: invite.email,
      teamName: team?.name || "a team",
      inviterName: inviterProfile?.full_name || "A teammate",
      inviteToken: invite.token,
    });
    emailSent = true;
  } catch (emailError) {
    console.error("Failed to send invite email:", emailError);
  }
  return NextResponse.json({
    ...invite,
    email_sent: emailSent,
    ...(!emailSent && { delivery_error: "Invitation created, but email could not be delivered. Share the invitation link instead." }),
  }, { status: 201 });
}
