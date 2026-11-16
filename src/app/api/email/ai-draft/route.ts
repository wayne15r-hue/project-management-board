import { z } from "zod";
import { AIError, askAI, extractJson } from "@/lib/ai/client";
import {
  EMAIL_DRAFT_AI_MODES, EMAIL_DRAFT_CONTEXT_LIMIT, EMAIL_DRAFT_LENGTHS, EMAIL_DRAFT_RETRY_MESSAGE, EMAIL_DRAFT_TONES,
} from "@/lib/email/ai-draft";
import { emailDraftAIEnabled, emailDraftSystemPrompt, emailPersonalDraftEnabled } from "@/lib/email/ai-draft-server";
import { emailFailure, emailJson, emailOriginAllowed, emailSession } from "@/lib/email/route-access";
import { jsonBody } from "@/lib/personal-ai/access";
import type { Receipt } from "@/lib/personal-ai/contracts";
import { PersonalAIError, personalAIErrorResponse } from "@/lib/personal-ai/errors";
import { runIdInput, selectionInput } from "@/lib/personal-ai/input";
import { personalQuote, runPersonalAI } from "@/lib/personal-ai/server";

export const maxDuration = 60;
const input = z.strictObject({
  context: z.string().max(EMAIL_DRAFT_CONTEXT_LIMIT).trim().min(1),
  mode: z.enum(EMAIL_DRAFT_AI_MODES),
  tone: z.enum(EMAIL_DRAFT_TONES),
  length: z.enum(EMAIL_DRAFT_LENGTHS),
  personal: z.strictObject({ selection: selectionInput, runId: runIdInput.optional() }).optional(),
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
  if (!emailDraftAIEnabled() && !emailPersonalDraftEnabled()) return emailFailure("Draft with AI is currently unavailable.", 503);
  if (!/^application\/json\b/i.test(request.headers.get("content-type") ?? "")) {
    return emailFailure("Use a JSON request.", 415);
  }
  const parsed = input.safeParse(await jsonBody(request));
  if (!parsed.success) return emailFailure("Check the email context and drafting options.", 400);

  const { personal, ...draftInput } = parsed.data;
  const prompt = { system: emailDraftSystemPrompt(draftInput.mode), input: JSON.stringify(draftInput), json: true };
  let receipt: Receipt | undefined;
  function draftError(error: string, status: number) {
    return receipt ? emailJson({ error, receipt }, status) : emailFailure(error, status);
  }
  try {
    let text: string;
    if (personal) {
      if (!emailPersonalDraftEnabled()) return emailFailure("Personal AI drafting is currently unavailable.", 503);
      if (!personal.runId) return emailJson(await personalQuote(access.user.id, personal.selection, prompt));
      const generation = await runPersonalAI(access.user.id, personal.selection, personal.runId, "email_draft", prompt);
      receipt = generation.receipt;
      text = extractJson(generation.text);
    } else {
      if (!emailDraftAIEnabled()) return emailFailure("Shared Groq drafting is currently unavailable.", 503);
      text = await askAI({
        userId: access.user.id,
        feature: "email_draft",
        systemPrompt: prompt.system,
        userMessage: prompt.input,
        maxTokens: 2_048,
        temperature: 0.2,
        json: true,
        clientOptions: { logLevel: "off", maxRetries: 0, timeout: 20_000 },
      });
    }
    const result: unknown = JSON.parse(text);
    if (refusal.safeParse(result).success) {
      return draftError("This tool only drafts appropriate emails. Describe the email you’d like to write.", 422);
    }
    const draft = (draftInput.mode === "reply" ? reply : newEmail).safeParse(result);
    if (!draft.success) return draftError(EMAIL_DRAFT_RETRY_MESSAGE, 502);
    return emailJson("subject" in draft.data
      ? { subject: draft.data.subject, body: draft.data.body, receipt }
      : { body: draft.data.body, receipt });
  } catch (error) {
    if (error instanceof PersonalAIError) return personalAIErrorResponse(error);
    if (error instanceof AIError && (error.code === "rate_limited" || error.code === "daily_limit")) {
      return emailFailure(error.message, 429);
    }
    return draftError(EMAIL_DRAFT_RETRY_MESSAGE, 502);
  }
}
