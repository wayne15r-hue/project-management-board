import { createClient } from "@/lib/supabase/server";

export function emailJson(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}

export function emailFailure(message: string, status: number) {
  return emailJson({ error: message }, status);
}

export function emailDatabaseError(error: { code: string; message: string }, action: string) {
  switch (error.code) {
    case "42501": return emailFailure("Email is unavailable for this account.", 403);
    case "P0404": return emailFailure(error.message, 404);
    case "40001": return emailFailure(error.message, 409);
    case "P0429": return emailFailure(error.message, 429);
    case "22023": return emailFailure(error.message, 400);
    default:
      console.error("Helios Email request failed", { action, code: error.code });
      return emailFailure("Email is temporarily unavailable. Try again.", 503);
  }
}

export async function emailSession(request: Request, signedDownload = false) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return emailFailure("Sign in to use Email.", 401);
  if (!signedDownload && request.headers.get("x-helios-email-user") !== user.id) {
    return emailFailure("Your account changed. Reload Email to continue.", 409);
  }
  const { data, error } = await db.rpc("email_enabled");
  if (error) return emailDatabaseError(error, "access");
  if (data !== true) return emailFailure("Email is unavailable for this account.", 403);
  return { db, user };
}

export function emailOriginAllowed(request: Request) {
  const origin = request.headers.get("origin");
  return (!origin || origin === new URL(request.url).origin) && request.headers.get("sec-fetch-site") !== "cross-site";
}
