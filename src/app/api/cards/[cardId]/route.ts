import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { updateCardSchema } from "@/lib/validators/card";
import { logActivity } from "@/lib/activity";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ cardId: string }> }
) {
  const { cardId } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("cards")
    .select(
      `
      *,
      assignee:profiles!cards_assignee_id_fkey (id, full_name, avatar_url, email)
    `
    )
    .eq("id", cardId)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ cardId: string }> }
) {
  const { cardId } = await params;
  const supabase = await createClient();

  const body = await request.json();
  const parsed = updateCardSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (parsed.data.title !== undefined) updateData.title = parsed.data.title;
  if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
  if (parsed.data.priority !== undefined) updateData.priority = parsed.data.priority;
  if (parsed.data.column_id !== undefined) updateData.column_id = parsed.data.column_id;
  if (parsed.data.position !== undefined) updateData.position = parsed.data.position;
  if (parsed.data.due_date !== undefined) updateData.due_date = parsed.data.due_date;
  if (parsed.data.start_date !== undefined) updateData.start_date = parsed.data.start_date;
  if (parsed.data.assignee_id !== undefined) updateData.assignee_id = parsed.data.assignee_id;

  // Fetch existing card for change tracking
  const { data: existing } = await supabase
    .from("cards")
    .select("*, assignee:profiles!cards_assignee_id_fkey(full_name)")
    .eq("id", cardId)
    .single();

  const { data, error } = await supabase
    .from("cards")
    .update(updateData)
    .eq("id", cardId)
    .select(
      `
      *,
      assignee:profiles!cards_assignee_id_fkey (id, full_name, avatar_url, email)
    `
    )
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Log activity
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user && existing) {
    const changes: Record<string, unknown> = {};
    if (parsed.data.title && parsed.data.title !== existing.title)
      changes.title = parsed.data.title;
    if (parsed.data.priority && parsed.data.priority !== existing.priority)
      changes.priority = parsed.data.priority;
    if (parsed.data.column_id && parsed.data.column_id !== existing.column_id) {
      // Resolve column name
      const { data: col } = await supabase
        .from("columns")
        .select("name")
        .eq("id", parsed.data.column_id)
        .single();
      changes.column_name = col?.name;
    }
    if (parsed.data.assignee_id !== undefined && parsed.data.assignee_id !== existing.assignee_id) {
      changes.assignee_name = data.assignee?.full_name || "Unassigned";
    }
    if (parsed.data.due_date !== undefined) changes.due_date = parsed.data.due_date;
    if (parsed.data.description !== undefined) changes.description = true;

    const action = changes.column_name
      ? "moved"
      : changes.assignee_name
        ? "assigned"
        : "updated";

    if (Object.keys(changes).length > 0) {
      logActivity({ cardId, actorId: user.id, action, changes });
    }
  }

  // Send notification email if assignee changed
  if (
    parsed.data.assignee_id &&
    existing &&
    parsed.data.assignee_id !== existing.assignee_id &&
    data.assignee?.email
  ) {
    try {
      const { Resend } = await import("resend");
      const resend = new Resend(process.env.RESEND_API_KEY);

      await resend.emails.send({
        from: "ProjectBoard <onboarding@resend.dev>",
        to: data.assignee.email,
        subject: `You've been assigned to "${data.title}"`,
        html: `
          <h2>Card Assignment</h2>
          <p>You've been assigned to <strong>${data.title}</strong>.</p>
          <p>Priority: ${data.priority}</p>
          ${data.due_date ? `<p>Due: ${new Date(data.due_date).toLocaleDateString()}</p>` : ""}
          <p><a href="${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/dashboard/board/${data.board_id}">View Board</a></p>
        `,
      });
    } catch (emailErr) {
      console.error("Failed to send assignment email:", emailErr);
    }
  }

  return NextResponse.json(data);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ cardId: string }> }
) {
  const { cardId } = await params;
  const supabase = await createClient();

  const { error } = await supabase.from("cards").delete().eq("id", cardId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
