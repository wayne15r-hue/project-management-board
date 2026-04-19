import { Resend } from "resend";

let resendInstance: Resend | null = null;

function getResend(): Resend {
  if (!resendInstance) {
    resendInstance = new Resend(process.env.RESEND_API_KEY);
  }
  return resendInstance;
}

const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const FROM = "ProjectBoard <onboarding@resend.dev>";

// ─── Shared layout ──────────────────────────────────────────────────────────

function layout(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background-color:#FBFBFA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',sans-serif;color:#37352F;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#FBFBFA;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
        <!-- Logo -->
        <tr><td style="padding-bottom:32px;">
          <span style="font-size:20px;font-weight:700;color:#37352F;">
            <span style="display:inline-block;width:28px;height:28px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:6px;vertical-align:middle;margin-right:8px;text-align:center;line-height:28px;color:#fff;font-size:14px;">P</span>
            ProjectBoard
          </span>
        </td></tr>
        <!-- Body -->
        <tr><td style="background:#FFFFFF;border-radius:12px;padding:32px;border:1px solid #E3E2DE;">
          ${body}
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding-top:24px;text-align:center;color:#787774;font-size:12px;">
          &copy; ${new Date().getFullYear()} ProjectBoard. You received this email because of your account activity.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function button(text: string, href: string): string {
  return `<a href="${href}" style="display:inline-block;padding:12px 28px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;margin-top:8px;">${text}</a>`;
}

function priorityBadge(priority: string): string {
  const colors: Record<string, string> = {
    high: "#EB5757",
    medium: "#F2994A",
    low: "#27AE60",
  };
  const color = colors[priority] || "#787774";
  return `<span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;background:${color}1A;color:${color};">${priority.charAt(0).toUpperCase() + priority.slice(1)}</span>`;
}

// ─── Email senders ──────────────────────────────────────────────────────────

export async function sendCardAssignedEmail(params: {
  to: string;
  assigneeName: string;
  cardTitle: string;
  boardName: string;
  boardId: string;
  priority: string;
  dueDate?: string | null;
}) {
  const resend = getResend();
  const boardUrl = `${APP_URL()}/dashboard/board/${params.boardId}`;

  const html = layout(`
    <h2 style="margin:0 0 8px;font-size:20px;color:#37352F;">You've been assigned a card</h2>
    <p style="margin:0 0 20px;color:#787774;font-size:14px;">Hi ${params.assigneeName || "there"}, you've been assigned to a card on <strong>${params.boardName}</strong>.</p>
    <div style="background:#F7F6F3;border-radius:8px;padding:16px 20px;margin-bottom:20px;">
      <p style="margin:0 0 8px;font-size:16px;font-weight:600;color:#37352F;">${params.cardTitle}</p>
      <p style="margin:0;font-size:13px;color:#787774;">
        ${priorityBadge(params.priority)}
        ${params.dueDate ? `&nbsp;&middot;&nbsp;Due ${new Date(params.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : ""}
      </p>
    </div>
    <p>${button("View Board", boardUrl)}</p>
  `);

  await resend.emails.send({
    from: FROM,
    to: params.to,
    subject: `You've been assigned to "${params.cardTitle}" on ${params.boardName}`,
    html,
  });
}

export async function sendDueDateReminderEmail(params: {
  to: string;
  recipientName: string;
  cardTitle: string;
  boardId: string;
  priority: string;
  dueDate: string;
  urgency: "tomorrow" | "today" | "overdue";
}) {
  const resend = getResend();
  const boardUrl = `${APP_URL()}/dashboard/board/${params.boardId}`;

  const urgencyText: Record<string, string> = {
    tomorrow: "is due tomorrow",
    today: "is due today",
    overdue: "is overdue",
  };
  const urgencyColor: Record<string, string> = {
    tomorrow: "#F2994A",
    today: "#EB5757",
    overdue: "#C0392B",
  };

  const html = layout(`
    <h2 style="margin:0 0 8px;font-size:20px;color:#37352F;">Due date reminder</h2>
    <p style="margin:0 0 20px;color:#787774;font-size:14px;">Hi ${params.recipientName || "there"},</p>
    <div style="background:#F7F6F3;border-radius:8px;padding:16px 20px;margin-bottom:20px;">
      <p style="margin:0 0 8px;font-size:16px;font-weight:600;color:#37352F;">${params.cardTitle}</p>
      <p style="margin:0;font-size:13px;">
        <span style="color:${urgencyColor[params.urgency]};font-weight:600;">${urgencyText[params.urgency]?.charAt(0).toUpperCase()}${urgencyText[params.urgency]?.slice(1)}</span>
        &nbsp;&middot;&nbsp;
        ${priorityBadge(params.priority)}
        &nbsp;&middot;&nbsp;
        <span style="color:#787774;">${new Date(params.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
      </p>
    </div>
    <p>${button("View Board", boardUrl)}</p>
  `);

  await resend.emails.send({
    from: FROM,
    to: params.to,
    subject: `"${params.cardTitle}" ${urgencyText[params.urgency]}`,
    html,
  });
}

export async function sendCommentNotificationEmail(params: {
  to: string;
  recipientName: string;
  commenterName: string;
  commentText: string;
  cardTitle: string;
  boardId: string;
}) {
  const resend = getResend();
  const boardUrl = `${APP_URL()}/dashboard/board/${params.boardId}`;

  const html = layout(`
    <h2 style="margin:0 0 8px;font-size:20px;color:#37352F;">New comment on "${params.cardTitle}"</h2>
    <p style="margin:0 0 20px;color:#787774;font-size:14px;">Hi ${params.recipientName || "there"},</p>
    <div style="background:#F7F6F3;border-radius:8px;padding:16px 20px;margin-bottom:20px;">
      <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#37352F;">${params.commenterName}</p>
      <p style="margin:0;font-size:14px;color:#55544F;line-height:1.5;">${params.commentText.length > 300 ? params.commentText.slice(0, 300) + "..." : params.commentText}</p>
    </div>
    <p>${button("View Card", boardUrl)}</p>
  `);

  await resend.emails.send({
    from: FROM,
    to: params.to,
    subject: `${params.commenterName} commented on "${params.cardTitle}"`,
    html,
  });
}

export async function sendTeamInviteEmail(params: {
  to: string;
  teamName: string;
  inviterName: string;
  inviteToken: string;
}) {
  const resend = getResend();
  const inviteUrl = `${APP_URL()}/invite/${params.inviteToken}`;

  const html = layout(`
    <h2 style="margin:0 0 8px;font-size:20px;color:#37352F;">You're invited!</h2>
    <p style="margin:0 0 20px;color:#787774;font-size:14px;">
      ${params.inviterName || "Someone"} invited you to join <strong>${params.teamName}</strong> on ProjectBoard.
    </p>
    <p style="margin:0 0 8px;color:#787774;font-size:13px;">
      Collaborate on boards, track tasks, and stay in sync with your team.
    </p>
    <p style="margin-top:20px;">${button("Accept Invitation", inviteUrl)}</p>
    <p style="margin-top:16px;color:#787774;font-size:12px;">This invitation expires in 7 days.</p>
  `);

  await resend.emails.send({
    from: FROM,
    to: params.to,
    subject: `You've been invited to join ${params.teamName} on ProjectBoard`,
    html,
  });
}
