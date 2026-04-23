import { createAdminClient } from "@/lib/supabase/admin";
import {
  sendAssignmentNotificationEmail,
  sendMentionNotificationEmail,
  sendCommentNotificationEmail,
} from "@/lib/email";

type NotificationType = "assignment" | "mention" | "comment";

export interface NotificationInput {
  recipientId: string;
  actorId: string;
  type: NotificationType;
  cardId: string;
  boardId: string;
  activityLogId?: string;
  title: string;
  body?: string;
  email?: {
    kind: "assignment" | "mention" | "comment";
    cardTitle: string;
    commentText?: string;
  };
}

/**
 * Creates an in-app notification row, and optionally sends an email
 * if the recipient has email_notifications enabled AND email payload is provided.
 *
 * Safe to call fire-and-forget. Errors are logged, never thrown to caller.
 * Never notify the actor themselves (recipientId === actorId → no-op).
 */
export async function createNotification(
  input: NotificationInput
): Promise<void> {
  if (input.recipientId === input.actorId) return;

  try {
    const supabase = createAdminClient();

    const { error: insertError } = await supabase.from("notifications").insert({
      recipient_id: input.recipientId,
      actor_id: input.actorId,
      type: input.type,
      card_id: input.cardId,
      board_id: input.boardId,
      activity_log_id: input.activityLogId ?? null,
      title: input.title,
      body: input.body ?? null,
    });

    if (insertError) {
      console.error("[notifications] insert failed:", insertError);
    }

    if (!input.email) return;

    const { data: recipient, error: recipientError } = await supabase
      .from("profiles")
      .select("email, full_name, email_notifications")
      .eq("id", input.recipientId)
      .single();

    if (recipientError || !recipient || !recipient.email) {
      console.error(
        "[notifications] recipient lookup failed:",
        recipientError
      );
      return;
    }

    if (!recipient.email_notifications) return;

    const { data: actor } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", input.actorId)
      .single();

    const actorName = actor?.full_name || actor?.email || "Someone";

    try {
      if (input.email.kind === "assignment") {
        await sendAssignmentNotificationEmail({
          to: recipient.email,
          recipientName: recipient.full_name || "",
          actorName,
          cardTitle: input.email.cardTitle,
          boardId: input.boardId,
          cardId: input.cardId,
        });
      } else if (input.email.kind === "mention") {
        await sendMentionNotificationEmail({
          to: recipient.email,
          recipientName: recipient.full_name || "",
          actorName,
          cardTitle: input.email.cardTitle,
          commentText: input.email.commentText || "",
          boardId: input.boardId,
          cardId: input.cardId,
        });
      } else if (input.email.kind === "comment") {
        await sendCommentNotificationEmail({
          to: recipient.email,
          recipientName: recipient.full_name || "",
          commenterName: actorName,
          commentText: input.email.commentText || "",
          cardTitle: input.email.cardTitle,
          boardId: input.boardId,
        });
      }
    } catch (emailErr) {
      console.error("[notifications] email send failed:", emailErr);
    }
  } catch (err) {
    console.error("[notifications] unexpected error:", err);
  }
}
