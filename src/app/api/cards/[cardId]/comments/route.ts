import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod/v4";

const commentSchema = z.object({
  text: z.string().min(1, "Comment is required").max(2000),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ cardId: string }> }
) {
  const { cardId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = commentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  // Insert as activity log with action "commented"
  const { data: activity, error } = await supabase
    .from("activity_log")
    .insert({
      card_id: cardId,
      actor_id: user.id,
      action: "commented",
      changes: { text: parsed.data.text },
    })
    .select(
      "*, actor:profiles!activity_log_actor_id_fkey(id, full_name, avatar_url, email)"
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Send email notifications (fire-and-forget)
  notifyCommentRecipients(supabase, cardId, user.id, parsed.data.text);

  return NextResponse.json(activity, { status: 201 });
}

async function notifyCommentRecipients(
  supabase: Awaited<ReturnType<typeof createClient>>,
  cardId: string,
  actorId: string,
  commentText: string
) {
  try {
    const { sendCommentNotificationEmail } = await import("@/lib/email");

    // Get the card with assignee and creator info
    const { data: card } = await supabase
      .from("cards")
      .select(
        `id, title, board_id, assignee_id, created_by,
        assignee:profiles!cards_assignee_id_fkey(id, full_name, email),
        creator:profiles!cards_created_by_fkey(id, full_name, email)`
      )
      .eq("id", cardId)
      .single();

    if (!card) return;

    // Get commenter name
    const { data: actor } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", actorId)
      .single();

    const commenterName = actor?.full_name || actor?.email || "Someone";

    // Collect unique recipients (assignee + creator, excluding the commenter)
    const recipients = new Map<string, { email: string; name: string }>();

    const assignee = card.assignee as unknown as {
      id: string;
      full_name: string | null;
      email: string;
    } | null;
    const creator = card.creator as unknown as {
      id: string;
      full_name: string | null;
      email: string;
    } | null;

    if (assignee && assignee.id !== actorId && assignee.email) {
      recipients.set(assignee.id, {
        email: assignee.email,
        name: assignee.full_name || "",
      });
    }
    if (creator && creator.id !== actorId && creator.email) {
      recipients.set(creator.id, {
        email: creator.email,
        name: creator.full_name || "",
      });
    }

    for (const [, recipient] of recipients) {
      try {
        await sendCommentNotificationEmail({
          to: recipient.email,
          recipientName: recipient.name,
          commenterName,
          commentText,
          cardTitle: card.title,
          boardId: card.board_id,
        });
      } catch (emailErr) {
        console.error("Failed to send comment notification:", emailErr);
      }
    }
  } catch (err) {
    console.error("Comment notification error:", err);
  }
}
