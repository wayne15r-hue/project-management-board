import type { EmailDraftAIInput, EmailDraftPreview } from "./ai-draft";

export class EmailRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function emailFetch<T>(url: string, userId: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("X-Helios-Email-User", userId);
  const response = await fetch(url, { ...init, headers, cache: "no-store" });
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw new EmailRequestError(result?.error || "Email is temporarily unavailable. Try again.", response.status);
  }
  return response.json();
}

export function emailRequest<T>(userId: string, query: Record<string, string> = {}, init?: RequestInit): Promise<T> {
  return emailFetch<T>("/api/email?" + new URLSearchParams(query), userId, init);
}

export function emailPost<T>(userId: string, body: Record<string, unknown>) {
  return emailRequest<T>(userId, {}, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

export function requestEmailDraft(userId: string, input: EmailDraftAIInput, signal: AbortSignal) {
  return emailFetch<EmailDraftPreview>("/api/email/ai-draft", userId, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), signal,
  });
}

export async function downloadEmailAttachment(userId: string, id: string) {
  const { href } = await emailRequest<{ href: string }>(userId, { view: "attachment-link", id });
  window.location.assign(href);
}

export function emailError(error: unknown) {
  return error instanceof EmailRequestError ? error.message : "Email is temporarily unavailable. Try again.";
}
