import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod/v4";
import { createNotification } from "@/lib/notifications";

const commentSchema = z.object({
  text: z.string().min(1, "Comment is required").max(2000),
  parent_id: z.string().uuid().nullable().optional(),
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

  const { data: activity, error } = await supabase
    .from("activity_log")
    .insert({
      card_id: cardId,
      actor_id: user.id,
      action: "commented",
      changes: parsed.data.parent_id
        ? { text: parsed.data.text, parent_id: parsed.data.parent_id }
        : { text: parsed.data.text },
    })
    .select(
      "*, actor:profiles!activity_log_actor_id_fkey(id, full_name, avatar_url, email)"
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  notifyCommentRecipients({
    cardId,
    actorId: user.id,
    commentText: parsed.data.text,
    activityLogId: activity.id,
  }).catch((e) => console.error("comment notification failed:", e));

  return NextResponse.json(activity, { status: 201 });
}

async function notifyCommentRecipients(args: {
  cardId: string;
  actorId: string;
  commentText: string;
  activityLogId: string;
}) {
  const { cardId, actorId, commentText, activityLogId } = args;
  const supabase = await createClient();

  const { data: card, error: cardError } = await supabase
    .from("cards")
    .select("id, title, board_id, assignee_id, created_by")
    .eq("id", cardId)
    .single();

  if (cardError || !card) {
    console.error("[comments POST] card lookup failed:", cardError);
    return;
  }

  const mentionIds = await resolveMentions(commentText, actorId);

  const commentRecipients = new Set<string>();
  if (card.assignee_id && card.assignee_id !== actorId)
    commentRecipients.add(card.assignee_id);
  if (card.created_by && card.created_by !== actorId)
    commentRecipients.add(card.created_by);
  for (const mid of mentionIds) commentRecipients.delete(mid);

  const body = commentText.length > 500
    ? commentText.slice(0, 500) + "..."
    : commentText;

  for (const recipientId of mentionIds) {
    await createNotification({
      recipientId,
      actorId,
      type: "mention",
      cardId: card.id,
      boardId: card.board_id,
      activityLogId,
      title: `You were mentioned in "${card.title}"`,
      body,
      email: {
        kind: "mention",
        cardTitle: card.title,
        commentText,
      },
    });
  }

  for (const recipientId of commentRecipients) {
    await createNotification({
      recipientId,
      actorId,
      type: "comment",
      cardId: card.id,
      boardId: card.board_id,
      activityLogId,
      title: `New comment on "${card.title}"`,
      body,
      email: {
        kind: "comment",
        cardTitle: card.title,
        commentText,
      },
    });
  }
}

async function resolveMentions(
  text: string,
  actorId: string
): Promise<string[]> {
  const matches = Array.from(text.matchAll(/@([\w._-]{2,})/g)).map((m) => m[1]);
  if (matches.length === 0) return [];

  const supabase = await createClient();
  const found = new Set<string>();

  for (const raw of matches) {
    const norm = raw.replace(/[\s._-]/g, "").toLowerCase();
    if (!norm) continue;

    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .or(`full_name.ilike.%${raw}%,email.ilike.%${raw}%`)
      .limit(20);
    if (error) {
      console.error("[comments POST] mention lookup failed:", error);
      continue;
    }
    for (const p of data ?? []) {
      const nameNorm = (p.full_name || "")
        .replace(/[\s._-]/g, "")
        .toLowerCase();
      const emailLocal = (p.email || "").split("@")[0]
        .replace(/[\s._-]/g, "")
        .toLowerCase();
      if (
        p.id !== actorId &&
        (nameNorm.includes(norm) || emailLocal.includes(norm))
      ) {
        found.add(p.id);
      }
    }
  }

  return Array.from(found);
}
