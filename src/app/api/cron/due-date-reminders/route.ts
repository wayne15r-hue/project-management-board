import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendDueDateReminderEmail } from "@/lib/email";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = createAdminClient();
  // UTC calendar days, independent of the server's local timezone and DST.
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const todayStart = new Date(`${today}T00:00:00.000Z`);
  const todayEnd = new Date(todayStart.getTime() + 86400000);
  const tomorrowEnd = new Date(todayStart.getTime() + 2 * 86400000);
  let sent = 0, failed = 0, total = 0;
  // Page by a unique immutable key rather than silently accepting the REST row cap.
  let after: string | null = null;
  for (;;) {
    let query = supabase.from("cards").select(`
      id, title, due_date, board_id, priority,
      column:columns!cards_column_id_fkey(id, name),
      board:boards!cards_board_id_fkey(columns(id, position)),
      assignee:profiles!cards_assignee_id_fkey(id, full_name, email, email_notifications)
    `).not("assignee_id", "is", null).not("due_date", "is", null)
      .lt("due_date", tomorrowEnd.toISOString()).order("id").limit(500);
    if (after) query = query.gt("id", after);
    const { data: cards, error } = await query;
    if (error) return NextResponse.json({ error: error.message, sent, failed }, { status: 500 });
    if (!cards?.length) break;
    total += cards.length;
    for (const card of cards) {
      const assignee = card.assignee as unknown as { id: string; email: string; full_name: string; email_notifications: boolean } | null;
      const column = card.column as unknown as { id: string; name: string } | null;
      const board = card.board as unknown as { columns: { id: string; position: number }[] | null } | null;
      // Recurrence/dashboard treat the terminal column as completed on boards
      // with two or more columns, even after renaming it. Named Done/Completed
      // columns are also excluded. A sole Todo column remains actionable.
      if (!assignee?.email || !assignee.email_notifications || !column || /^(done|completed)$/i.test(column.name.trim())) continue;
      const columns = board?.columns;
      // Without the full completion metadata, defer delivery to the next run.
      if (!columns?.length || !columns.some((entry) => entry.id === column.id) || columns.some((entry) => !Number.isFinite(entry.position))) continue;
      const terminal = columns.reduce((last, entry) => entry.position > last.position || (entry.position === last.position && entry.id > last.id) ? entry : last);
      if (columns.length >= 2 && column.id === terminal.id) continue;
      const due = new Date(card.due_date!);
      const urgency = due < todayStart ? "overdue" : due < todayEnd ? "today" : "tomorrow";
      try {
        // Service-role selection bypasses RLS: re-check current board access,
        // including legacy assignments and members whose access was revoked.
        const { data: allowed, error: accessError } = await supabase.rpc("notification_recipient_allowed", {
          p_card_id: card.id, p_board_id: card.board_id,
          p_actor_id: assignee.id, p_recipient_id: assignee.id,
        });
        if (accessError) throw new Error("Reminder recipient access check failed");
        if (allowed !== true) continue;
        await sendDueDateReminderEmail({
          to: assignee.email, recipientName: assignee.full_name || "", cardTitle: card.title,
          boardId: card.board_id, priority: card.priority, dueDate: card.due_date!, urgency,
          // Resend deduplicates accepted requests for 24h; concurrent/retried cron runs
          // use the same UTC-day key and deterministic payload.
          idempotencyKey: `due-${card.id}-${assignee.id}-${today}`,
        });
        sent++;
      } catch (error) {
        failed++;
        console.error(`Reminder delivery failed for card ${card.id}:`, error);
      }
    }
    if (cards.length < 500) break;
    after = cards[cards.length - 1].id;
  }
  return NextResponse.json({ sent, failed, total, timezone: "UTC" });
}
