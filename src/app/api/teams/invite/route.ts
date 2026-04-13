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

  // Send invite email via Resend
  try {
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    const { data: team } = await supabase
      .from("teams")
      .select("name")
      .eq("id", parsed.data.teamId)
      .single();

    await resend.emails.send({
      from: "ProjectBoard <onboarding@resend.dev>",
      to: parsed.data.email,
      subject: `You've been invited to join ${team?.name || "a team"} on ProjectBoard`,
      html: `
        <h2>Team Invitation</h2>
        <p>You've been invited to join <strong>${team?.name || "a team"}</strong> on ProjectBoard.</p>
        <p><a href="${appUrl}/invite/${invite.token}" style="display:inline-block;padding:12px 24px;background:#171717;color:#fff;text-decoration:none;border-radius:8px;">Accept Invitation</a></p>
        <p>This invitation expires in 7 days.</p>
      `,
    });
  } catch (emailError) {
    console.error("Failed to send invite email:", emailError);
    // Don't fail the request - invite is still created
  }

  return NextResponse.json(invite, { status: 201 });
}
