import { z } from "zod";
import { AIError, askAI } from "@/lib/ai/client";
import {
  EMAIL_DRAFT_AI_MODES, EMAIL_DRAFT_CONTEXT_LIMIT, EMAIL_DRAFT_LENGTHS, EMAIL_DRAFT_RETRY_MESSAGE, EMAIL_DRAFT_TONES,
} from "@/lib/email/ai-draft";
import { emailDraftAIEnabled, emailDraftSystemPrompt } from "@/lib/email/ai-draft-server";
import { emailFailure, emailJson, emailOriginAllowed, emailSession } from "@/lib/email/route-access";

const input = z.strictObject({
  context: z.string().max(EMAIL_DRAFT_CONTEXT_LIMIT).trim().min(1),
  mode: z.enum(EMAIL_DRAFT_AI_MODES),
  tone: z.enum(EMAIL_DRAFT_TONES),
  length: z.enum(EMAIL_DRAFT_LENGTHS),
});
const subject = z.string().trim().min(1).max(200).regex(/^[^\r\n]+$/);
const body = z.string().trim().min(1).max(4_000);
const reply = z.strictObject({ status: z.literal("draft"), body });
const newEmail = reply.extend({ subject });
const refusal = z.strictObject({ status: z.literal("refused") });

export async function POST(request: Request) {
  if (!emailOriginAllowed(request)) return emailFailure("Invalid request origin.", 403);
  const access = await emailSession(request);
  if (access instanceof Response) return access;
  if (!emailDraftAIEnabled()) return emailFailure("Draft with AI is currently unavailable.", 503);
  if (!/^application\/json\b/i.test(request.headers.get("content-type") ?? "")) {
    return emailFailure("Use a JSON request.", 415);
  }
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return emailFailure("Check the email context and drafting options.", 400);

  try {
    const result: unknown = JSON.parse(await askAI({
      userId: access.user.id,
      feature: "email_draft",
      systemPrompt: emailDraftSystemPrompt(parsed.data.mode),
      userMessage: JSON.stringify(parsed.data),
      maxTokens: 2_048,
      json: true,
      clientOptions: { logLevel: "off", maxRetries: 0, timeout: 20_000 },
    }));
    if (refusal.safeParse(result).success) {
      return emailFailure("This tool only drafts appropriate emails. Describe the email you’d like to write.", 422);
    }
    const draft = (parsed.data.mode === "reply" ? reply : newEmail).safeParse(result);
    if (!draft.success) return emailFailure(EMAIL_DRAFT_RETRY_MESSAGE, 502);
    return emailJson("subject" in draft.data
      ? { subject: draft.data.subject, body: draft.data.body }
      : { body: draft.data.body });
  } catch (error) {
    if (error instanceof AIError && (error.code === "rate_limited" || error.code === "daily_limit")) {
      return emailFailure(error.message, 429);
    }
    return emailFailure(EMAIL_DRAFT_RETRY_MESSAGE, 502);
  }
}
