import Groq from "groq-sdk";
import { createClient } from "@/lib/supabase/server";

export const AI_MODEL =
  process.env.AI_MODEL || "llama-3.3-70b-versatile";
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

async function checkDailyLimit(userId: string): Promise<void> {
  const supabase = await createClient();
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const { count } = await supabase
    .from("ai_usage")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", since.toISOString());
  if ((count ?? 0) >= DAILY_LIMIT) {
    throw new AIError(
      "Daily AI limit reached. Resets tomorrow.",
      "daily_limit",
      429
    );
  }
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
  if (!aiConfigured()) {
    throw new AIError(
      "AI features are currently unavailable.",
      "not_configured",
      503
    );
  }
  await checkDailyLimit(opts.userId);

  const client = getGroqClient();

  let response;
  try {
    response = await client.chat.completions.create({
      model: AI_MODEL,
      max_tokens: opts.maxTokens ?? 1024,
      temperature: 0.7,
      response_format: opts.json ? { type: "json_object" } : undefined,
      messages: [
        { role: "system", content: opts.systemPrompt },
        { role: "user", content: opts.userMessage },
      ],
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
    const supabase = await createClient();
    await supabase.from("ai_usage").insert({
      user_id: opts.userId,
      feature: opts.feature,
      input_tokens: response.usage?.prompt_tokens ?? 0,
      output_tokens: response.usage?.completion_tokens ?? 0,
      model: AI_MODEL,
    });
  } catch {
    // ignore usage logging errors
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
