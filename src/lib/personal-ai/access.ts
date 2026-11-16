import { createClient } from "@/lib/supabase/server";
import { personalAIJson } from "./errors";
import { personalAIEnabled } from "./server";

export async function personalAISession(request: Request) {
  if (!personalAIEnabled()) return personalAIJson({ error: "Personal API Connections are unavailable." }, 404);
  const origin = request.headers.get("origin");
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site") {
    return personalAIJson({ error: "Invalid request origin." }, 403);
  }
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return personalAIJson({ error: "Sign in to use Personal AI." }, 401);
  if (request.headers.get("x-helios-ai-user") !== user.id) {
    return personalAIJson({ error: "Your account changed. Reload this page to continue." }, 409);
  }
  const { data, error } = await db.rpc("account_is_active");
  if (error) return personalAIJson({ error: "Account access could not be checked." }, 503);
  if (data !== true) return personalAIJson({ error: "Personal AI is unavailable for this account." }, 403);
  return { db, userId: user.id };
}

export async function jsonBody(request: Request) {
  if (!/^application\/json\b/i.test(request.headers.get("content-type") ?? "")) return null;
  // Cap bytes before parsing, including requests that omit Content-Length.
  const reader = request.body?.getReader();
  if (!reader) return null;
  const limit = 150_000;
  const decoder = new TextDecoder();
  let size = 0;
  let body = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) return JSON.parse(body + decoder.decode()) as unknown;
      size += chunk.value.byteLength;
      if (size > limit) { await reader.cancel(); return null; }
      body += decoder.decode(chunk.value, { stream: true });
    }
  } catch {
    return null;
  }
}
