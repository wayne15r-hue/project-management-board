import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendDueDateReminderEmail } from "@/lib/email";

export async function GET(request: Request) {
  // Verify cron secret for Vercel Cron Jobs
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowEnd = new Date(todayEnd.getTime() + 24 * 60 * 60 * 1000);

  // Find cards with due dates: overdue, today, or tomorrow — that have an assignee
  const { data: cards, error } = await supabase
    .from("cards")
    .select(
      `
      id, title, due_date, board_id, priority,
      assignee:profiles!cards_assignee_id_fkey (id, full_name, email)
    `
    )
    .not("assignee_id", "is", null)
    .not("due_date", "is", null)
    .lte("due_date", tomorrowEnd.toISOString());

  if (error) {
    console.error("Cron error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!cards || cards.length === 0) {
    return NextResponse.json({ sent: 0 });
  }

  let sent = 0;

  for (const card of cards) {
    const assignee = card.assignee as unknown as { email: string; full_name: string } | null;
    if (!assignee?.email) continue;

    const dueDate = new Date(card.due_date!);
    let urgency: "overdue" | "today" | "tomorrow";

    if (dueDate < todayStart) {
      urgency = "overdue";
    } else if (dueDate < todayEnd) {
      urgency = "today";
    } else {
      urgency = "tomorrow";
    }

    try {
      await sendDueDateReminderEmail({
        to: assignee.email,
        recipientName: assignee.full_name || "",
        cardTitle: card.title,
        boardId: card.board_id,
        priority: card.priority,
        dueDate: card.due_date!,
        urgency,
      });
      sent++;
    } catch (emailErr) {
      console.error(`Failed to send reminder for card ${card.id}:`, emailErr);
    }
  }

  return NextResponse.json({ sent, total: cards.length });
}
