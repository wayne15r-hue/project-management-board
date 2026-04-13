import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  // Verify cron secret for Vercel Cron Jobs
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const now = new Date();
  const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  // Find cards with due dates in the next 24 hours that have an assignee
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
    .gte("due_date", now.toISOString())
    .lte("due_date", in24Hours.toISOString());

  if (error) {
    console.error("Cron error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!cards || cards.length === 0) {
    return NextResponse.json({ sent: 0 });
  }

  let sent = 0;

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    for (const card of cards) {
      const assignee = card.assignee as unknown as { email: string; full_name: string } | null;
      if (!assignee?.email) continue;

      try {
        await resend.emails.send({
          from: "ProjectBoard <onboarding@resend.dev>",
          to: assignee.email,
          subject: `Reminder: "${card.title}" is due soon`,
          html: `
            <h2>Due Date Reminder</h2>
            <p>Hi ${assignee.full_name || "there"},</p>
            <p>The card <strong>${card.title}</strong> is due ${card.due_date ? new Date(card.due_date).toLocaleString() : "soon"}.</p>
            <p>Priority: ${card.priority}</p>
            <p><a href="${appUrl}/dashboard/board/${card.board_id}" style="display:inline-block;padding:12px 24px;background:#171717;color:#fff;text-decoration:none;border-radius:8px;">View Board</a></p>
          `,
        });
        sent++;
      } catch (emailErr) {
        console.error(`Failed to send reminder for card ${card.id}:`, emailErr);
      }
    }
  } catch (err) {
    console.error("Resend initialization failed:", err);
  }

  return NextResponse.json({ sent, total: cards.length });
}
