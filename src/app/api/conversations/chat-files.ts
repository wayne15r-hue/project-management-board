import type { SupabaseClient } from "@supabase/supabase-js";

/** Compatibility for previously persisted signed URLs from this project's bucket only. */
export function chatObjectPath(value: string | null, conversationId: string, projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL): string | null {
  if (!value) return null;
  let path = value;
  if (/^https?:/i.test(value)) {
    try {
      const url = new URL(value);
      const project = new URL(projectUrl!);
      const prefix = "/storage/v1/object/sign/chat-files/";
      if (url.origin !== project.origin || !url.pathname.startsWith(prefix)) return null;
      path = decodeURIComponent(url.pathname.slice(prefix.length));
    } catch { return null; }
  }
  if (!path.startsWith(`${conversationId}/`) || /[\\%?#\u0000-\u001f]/.test(path)) return null;
  if (path.split("/").some((part) => !part || part === "." || part === "..")) return null;
  return path;
}

export async function signChatFile<T extends { file_url: string | null }>(supabase: SupabaseClient, conversationId: string, message: T): Promise<T> {
  const path = chatObjectPath(message.file_url, conversationId);
  if (!path) return { ...message, file_url: null };
  const { data, error } = await supabase.storage.from("chat-files").createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) throw new Error("Could not sign chat attachment");
  return { ...message, file_url: data.signedUrl };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseMessageCursor(before: string | null, beforeId: string | null) {
  if (!before && !beforeId) return null;
  // Restrict interpolation into the PostgREST OR filter to canonical timestamp/UUID syntax.
  if (!before || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(before) || !Number.isFinite(Date.parse(before)) || (beforeId && !UUID.test(beforeId))) throw new Error("Invalid message cursor");
  return { before, beforeId };
}
export function messagePageLimit(value: string | null) {
  if (value === null) return 50;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1) throw new Error("Invalid page limit");
  return Math.min(limit, 100);
}
