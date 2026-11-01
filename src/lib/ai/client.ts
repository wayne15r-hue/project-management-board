import Groq from "groq-sdk";
import { createAdminClient } from "@/lib/supabase/admin";

export const AI_MODEL =
  process.env.AI_MODEL || "openai/gpt-oss-120b";
export const DAILY_LIMIT = 50;

export class AIError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "not_configured"
      | "not_enabled"
      | "rate_limited"
      | "daily_limit"
      | "network"
      | "unknown",
    public readonly status: number = 500
  ) {
    super(message);
  }
}

export function aiConfigured(): boolean {
  return Boolean(process.env.GROQ_API_KEY) && process.env.AI_ENABLED !== "false";
}

export function getGroqClient() {
  if (!process.env.GROQ_API_KEY) {
    throw new AIError(
      "AI features are currently unavailable. The server is missing GROQ_API_KEY.",
      "not_configured",
      503
    );
  }
  return new Groq({ apiKey: process.env.GROQ_API_KEY });
}

async function reserveUsage(userId: string, feature: string): Promise<string> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("reserve_ai_usage", {
    p_user_id: userId,
    p_feature: feature,
  });
  if (!data && !error || error?.message === "Daily AI limit reached") {
    throw new AIError(
      "Daily AI limit reached. Resets tomorrow.",
      "daily_limit",
      429
    );
  }
  if (error) throw new AIError("AI usage tracking is unavailable. Try again later.", "unknown", 503);
  return data as string;
}

type AskOptions = {
  userId: string;
  systemPrompt: string;
  userMessage: string;
  feature: string;
  maxTokens?: number;
  json?: boolean;
};

export async function askAI(opts: AskOptions): Promise<string> {
  return completeAI({
    userId: opts.userId, feature: opts.feature, maxTokens: opts.maxTokens,
    json: opts.json,
    messages: [
      { role: "system", content: opts.systemPrompt },
      { role: "user", content: opts.userMessage },
    ],
  });
}

export async function completeAI(opts: {
  userId: string;
  feature: string;
  maxTokens?: number;
  json?: boolean;
  messages: Groq.Chat.Completions.ChatCompletionMessageParam[];
}): Promise<string> {
  if (!aiConfigured()) {
    throw new AIError(
      "AI features are currently unavailable.",
      "not_configured",
      503
    );
  }
  // Attempts consume one daily slot even when the provider fails. Reserving
  // before the billed request prevents concurrent calls from exceeding the cap.
  const usageId = await reserveUsage(opts.userId, opts.feature);

  const client = getGroqClient();

  let response;
  try {
    response = await client.chat.completions.create({
      model: AI_MODEL,
      max_tokens: opts.maxTokens ?? 1024,
      temperature: 0.7,
      response_format: opts.json ? { type: "json_object" } : undefined,
      messages: opts.messages,
    });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    if (e?.status === 429) {
      throw new AIError(
        "The AI service is rate-limited. Try again in a moment.",
        "rate_limited",
        429
      );
    }
    throw new AIError(e?.message || "AI request failed.", "network", 502);
  }

  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("ai_usage").update({
      input_tokens: response.usage?.prompt_tokens ?? 0,
      output_tokens: response.usage?.completion_tokens ?? 0,
      model: AI_MODEL,
    }).eq("id", usageId);
    if (error) console.error("AI usage totals could not be updated:", error.message);
  } catch (error) {
    console.error("AI usage totals could not be updated:", error);
  }

  const text = response.choices[0]?.message?.content ?? "";
  if (opts.json) return extractJson(text);
  return text;
}

// Back-compat alias so existing routes (`askClaude`) keep working.
export const askClaude = askAI;

export function extractJson(text: string): string {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) return fence[1].trim();
  const first = text.indexOf("{");
  const firstArr = text.indexOf("[");
  const start =
    first === -1
      ? firstArr
      : firstArr === -1
        ? first
        : Math.min(first, firstArr);
  if (start === -1) return text.trim();
  return text.slice(start).trim();
}

export function aiErrorResponse(err: unknown): {
  status: number;
  body: { error: string; code: string };
} {
  if (err instanceof AIError) {
    return { status: err.status, body: { error: err.message, code: err.code } };
  }
  const message = err instanceof Error ? err.message : "Unexpected AI error.";
  return { status: 500, body: { error: message, code: "unknown" } };
}
