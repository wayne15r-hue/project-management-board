import type { EmailMessage, EmailRecipient } from "./types";

export function replyRecipients(message: EmailMessage, viewerId: string, everyone: boolean): EmailRecipient[] {
  const results: EmailRecipient[] = [];
  if (message.sender.eligible && message.sender.id !== viewerId) {
    results.push({ ...message.sender, kind: "to" });
  }
  if (message.isBcc) return results;
  const visible = message.recipients.filter((p) => p.kind !== "bcc" && p.eligible && p.id !== viewerId
    && p.id !== message.sender.id);
  if (everyone) return [...results, ...visible].slice(0, 20);
  if (!results.length && message.direction === "sent" && visible[0]) {
    results.push({ ...visible[0], kind: "to" });
  }
  return results;
}

export function replySubject(subject: string, prefix: "Re" | "Fwd") {
  const original = subject.trim();
  const tagged = original.toLowerCase().startsWith(prefix.toLowerCase() + ":") ? original : prefix + ": " + original;
  return Array.from(tagged).slice(0, 200).join("");
}
