import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { EMAIL_ACTIONS, EMAIL_FOLDERS, EMAIL_KINDS } from "@/lib/email/types";
import {
  EMAIL_BUCKET, EmailFileError, emailContentDisposition, emailDownloadLink, readEmailUpload, verifyEmailDownload,
} from "@/lib/email/files";

type Client = Awaited<ReturnType<typeof createClient>>;
type Attachment = { path: string; name: string; mime: string };
const uuid = z.uuid();
const version = z.number().int().min(1).max(2_147_483_647);
const draftKey = z.object({ id: uuid, version });
const input = z.discriminatedUnion("action", [
  draftKey.extend({ action: z.literal("send") }),
  draftKey.extend({ action: z.literal("delete-draft") }),
  z.object({ action: z.literal("save-draft"), id: uuid, version: z.number().int().min(0).max(2_147_483_647),
    subject: z.string().max(400), body: z.string().max(100_000),
    recipients: z.array(z.object({ id: uuid, kind: z.enum(EMAIL_KINDS) })).max(20) }),
  z.object({ action: z.literal("open"), id: uuid }),
  z.object({ action: z.literal("mailbox"), id: uuid.nullable(), change: z.enum(EMAIL_ACTIONS) }),
  z.object({ action: z.literal("forward-files"), draft: uuid, source: uuid, version }),
  z.object({ action: z.literal("remove-file"), draft: uuid, attachment: uuid, version }),
]);
const folders = z.enum(EMAIL_FOLDERS);
const offset = z.coerce.number().int().min(0).max(2_147_483_621);
const noStore = { "Cache-Control": "private, no-store" };

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: noStore });
}

function fail(message: string, status: number) {
  return json({ error: message }, status);
}

function databaseError(error: { code: string; message: string }, action: string) {
  switch (error.code) {
    case "42501": return fail("Email is unavailable for this account.", 403);
    case "P0404": return fail(error.message, 404);
    case "40001": return fail(error.message, 409);
    case "P0429": return fail(error.message, 429);
    case "22023": return fail(error.message, 400);
    default:
      console.error("Helios Email request failed", { action, code: error.code });
      return fail("Email is temporarily unavailable. Try again.", 503);
  }
}

async function session(request: Request, signedDownload = false) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return fail("Sign in to use Email.", 401);
  if (!signedDownload && request.headers.get("x-helios-email-user") !== user.id) {
    return fail("Your account changed. Reload Email to continue.", 409);
  }
  const { data, error } = await db.rpc("email_enabled");
  if (error) return databaseError(error, "access");
  if (data !== true) return fail("Email is unavailable for this account.", 403);
  return { db, user };
}

async function rpc(db: Client, action: string, args?: Record<string, unknown>) {
  const { data, error } = await db.rpc(action, args);
  return error ? databaseError(error, action) : json(data);
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const view = params.get("view") ?? "list";
  const access = await session(request, view === "download");
  if (access instanceof Response) return access;
  const { db, user } = access;
  const term = params.get("q") ?? "";
  if (term.length > 254) return fail("Search can contain up to 254 characters.", 400);

  if (view === "list") {
    const folder = folders.safeParse(params.get("folder") ?? "inbox");
    const start = offset.safeParse(params.get("offset") ?? "0");
    if (!folder.success || !start.success) return fail("Invalid folder or page.", 400);
    return rpc(db, "email_list", { p_folder: folder.data, p_query: term, p_unread: params.get("unread") === "1", p_offset: start.data });
  }
  if (view === "count") return rpc(db, "email_unread_count");
  if (view === "directory") return rpc(db, "email_directory", { p_query: term });

  const id = uuid.safeParse(params.get("id"));
  if (!id.success) return fail("Invalid item.", 400);
  if (view === "draft") return rpc(db, "email_get_draft", { p_id: id.data });
  if (view !== "download" && view !== "attachment-link") return fail("Unknown Email view.", 400);

  try {
    if (view === "download" && !verifyEmailDownload(user.id, id.data, params.get("expiry"), params.get("sig"))) {
      return fail("This link expired. Open the attachment again.", 403);
    }
    const { data, error } = await db.rpc("email_attachment_access", { p_id: id.data });
    if (error) return databaseError(error, "attachment");
    if (view === "attachment-link") return json({ href: emailDownloadLink(user.id, id.data) });

    const file = data as Attachment;
    const result = await createAdminClient().storage.from(EMAIL_BUCKET).download(file.path);
    if (result.error || !result.data) return fail("Attachment temporarily unavailable.", 503);
    return new Response(result.data, { headers: { ...noStore,
      "Content-Type": file.mime,
      "Content-Disposition": emailContentDisposition(file.name),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
    } });
  } catch {
    console.error("Helios Email attachment service unavailable");
    return fail("Attachment temporarily unavailable.", 503);
  }
}

async function upload(request: Request, draft: string, user: string, draftVersion: number) {
  const id = randomUUID();
  try {
    const { name, mime, data } = await readEmailUpload(request);
    const admin = createAdminClient();
    const reserved = await admin.rpc("email_reserve_upload", {
      p_draft: draft, p_file: id, p_user: user, p_name: name, p_mime: mime, p_bytes: data.byteLength, p_version: draftVersion,
    });
    if (reserved.error) return databaseError(reserved.error, "reserve upload");
    let uploaded = false;
    try {
      const result = await admin.storage.from(EMAIL_BUCKET).upload(id, data, { contentType: mime, cacheControl: "0" });
      uploaded = !result.error;
    } catch {
      console.error("Helios Email Storage upload did not complete");
    }
    const finished = await admin.rpc("email_finish_upload", { p_draft: draft, p_file: id, p_user: user, p_success: uploaded, p_version: draftVersion });
    if (finished.error) return databaseError(finished.error, "finish upload");
    if (finished.data?.conflict) return fail("This draft changed elsewhere.", 409);
    if (uploaded && finished.data?.id) {
      return json({ item: { id: finished.data.id, name, bytes: data.byteLength }, version: finished.data.version }, 201);
    }
    return fail("The upload could not be saved. Try again.", 503);
  } catch (error) {
    if (error instanceof EmailFileError) return fail(error.message, error.status);
    console.error("Helios Email upload service unavailable");
    return fail("The upload could not be saved. Try again.", 503);
  }
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  if ((origin && origin !== url.origin) || request.headers.get("sec-fetch-site") === "cross-site") {
    return fail("Invalid request origin.", 403);
  }
  const access = await session(request);
  if (access instanceof Response) return access;
  const { db, user } = access;

  if (url.searchParams.has("upload")) {
    const draft = uuid.safeParse(url.searchParams.get("upload"));
    const draftVersion = z.coerce.number().pipe(version).safeParse(url.searchParams.get("version"));
    return draft.success && draftVersion.success
      ? upload(request, draft.data, user.id, draftVersion.data) : fail("Invalid draft.", 400);
  }
  if (!/^application\/json\b/i.test(request.headers.get("content-type") ?? "")) {
    return fail("Use a JSON request.", 415);
  }
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Check the message fields and try again.", 400);
  const body = parsed.data;

  switch (body.action) {
    case "save-draft":
      return rpc(db, "email_save_draft", {
        p_id: body.id, p_version: body.version, p_subject: body.subject, p_body: body.body, p_recipients: body.recipients,
      });
    case "send": {
      const response = await rpc(db, "email_send", { p_id: body.id, p_version: body.version });
      console.info("Helios Email send outcome", { status: response.status });
      return response;
    }
    case "delete-draft": return rpc(db, "email_delete_draft", { p_id: body.id, p_version: body.version });
    case "open": return rpc(db, "email_detail", { p_id: body.id });
    case "mailbox": return rpc(db, "email_mailbox_action", { p_id: body.id, p_action: body.change });
    case "forward-files": return rpc(db, "email_forward_files", { p_draft: body.draft, p_source: body.source, p_version: body.version });
    case "remove-file": return rpc(db, "email_remove_attachment", { p_draft: body.draft, p_attachment: body.attachment, p_version: body.version });
  }
}
