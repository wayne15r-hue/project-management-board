import { createAdminClient } from '@/lib/supabase/admin';type NotificationType = "assignment" | "mention" | "comment";

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

/** Compatibility adapter. Source-write triggers own transactional generation. */
export async function createNotification(input: NotificationInput): Promise<void> {
  if (input.recipientId === input.actorId) return;
  const {error}=await createAdminClient().rpc('workflow_notify_legacy',{
    p_card_id:input.cardId,p_board_id:input.boardId,p_actor_id:input.actorId,
    p_recipient_id:input.recipientId,p_type:input.type,p_activity_log_id:input.activityLogId??null,
    p_title:input.title,p_body:input.body??null,
  });
  if(error) console.error('[notifications] durable adapter failed');
}
