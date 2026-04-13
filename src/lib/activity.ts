import { createAdminClient } from "@/lib/supabase/admin";

interface LogActivityParams {
  cardId: string;
  actorId: string;
  action: string;
  changes?: Record<string, unknown> | null;
}

export async function logActivity({
  cardId,
  actorId,
  action,
  changes,
}: LogActivityParams) {
  const supabase = createAdminClient();

  const { error } = await supabase.from("activity_log").insert({
    card_id: cardId,
    actor_id: actorId,
    action,
    changes: changes || null,
  });

  if (error) {
    console.error("Failed to log activity:", error);
  }
}

export function describeActivity(
  action: string,
  changes: Record<string, unknown> | null,
  actorName: string
): string {
  switch (action) {
    case "created":
      return `${actorName} created this card`;
    case "updated": {
      if (!changes) return `${actorName} updated this card`;
      const parts: string[] = [];
      if (changes.title) parts.push("title");
      if (changes.description !== undefined) parts.push("description");
      if (changes.priority)
        parts.push(`priority to ${changes.priority}`);
      if (changes.column_name)
        parts.push(`status to ${changes.column_name}`);
      if (changes.assignee_name)
        parts.push(`assignee to ${changes.assignee_name}`);
      if (changes.due_date !== undefined) parts.push("due date");
      if (changes.start_date !== undefined) parts.push("start date");
      if (parts.length === 0) return `${actorName} updated this card`;
      return `${actorName} changed ${parts.join(", ")}`;
    }
    case "moved":
      return `${actorName} moved card to ${changes?.column_name || "another column"}`;
    case "assigned":
      return `${actorName} assigned this card to ${changes?.assignee_name || "someone"}`;
    case "deleted":
      return `${actorName} deleted this card`;
    default:
      return `${actorName} ${action}`;
  }
}
