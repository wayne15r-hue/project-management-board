import { createHmac, timingSafeEqual } from "node:crypto";

export const EMAIL_BUCKET = "helios-email";
export const MAX_FILE_BYTES = 3_000_000;

export class EmailFileError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function readEmailUpload(request: Request) {
  const size = Number(request.headers.get("content-length"));
  if (size > MAX_FILE_BYTES) throw new EmailFileError("Each file must be 3 MB or smaller.", 413);
  let filename: string;
  try {
    filename = decodeURIComponent(request.headers.get("x-email-filename") ?? "");
  } catch {
    throw new EmailFileError("Invalid filename.", 400);
  }
  const safeName = filename.normalize("NFC").replace(/[\p{C}"/\\:;<>|?*]/gu, "_").trim();
  const name = Array.from(safeName).slice(-180).join("");
  const reader = request.body?.getReader();
  if (!reader || !name) throw new EmailFileError("Choose a file to attach.", 400);

  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_FILE_BYTES) {
      void reader.cancel().catch(() => undefined);
      throw new EmailFileError("Each file must be 3 MB or smaller.", 413);
    }
    chunks.push(value);
  }
  if (!total) throw new EmailFileError("The file is empty.", 400);

  const data = Buffer.concat(chunks, total);
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  const starts = (signature: string) => data.subarray(0, signature.length).equals(Buffer.from(signature, "latin1"));
  let mime: string | undefined;
  if (ext === "pdf" && starts("%PDF-") && data.includes("%%EOF")) mime = "application/pdf";
  if (ext === "png" && starts("\x89PNG\r\n\x1a\n") && data.toString("ascii", 12, 16) === "IHDR") mime = "image/png";
  if ((ext === "jpg" || ext === "jpeg") && starts("\xff\xd8\xff")
    && data.at(-2) === 255 && data.at(-1) === 217) mime = "image/jpeg";
  if (ext === "gif" && (starts("GIF87a") || starts("GIF89a")) && data.length >= 14 && data.at(-1) === 59) mime = "image/gif";
  if (ext === "webp" && data.length >= 20 && starts("RIFF") && data.toString("ascii", 8, 12) === "WEBP"
    && data.readUInt32LE(4) + 8 === data.length) mime = "image/webp";
  if (ext === "txt") {
    try {
      const decoded = new TextDecoder("utf-8", { fatal: true }).decode(data);
      if (!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(decoded)
        && !decoded.trimStart().startsWith("<") && !starts("%PDF-")) mime = "text/plain";
    } catch {
      // Invalid UTF-8 is outside the plain-text allowlist.
    }
  }
  if (!mime) throw new EmailFileError("Use a valid PDF, PNG, JPEG, WebP, GIF, or UTF-8 TXT file with a matching extension.", 415);
  return { name, mime, data };
}

function signature(userId: string, id: string, expiry: number) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Email download signing is unavailable.");
  return createHmac("sha256", secret).update(["helios-email-download-v1", userId, id, expiry].join(":")).digest("hex");
}

export function emailDownloadLink(userId: string, id: string) {
  const expiry = Math.floor(Date.now() / 1000) + 60;
  const params = new URLSearchParams({ view: "download", id, expiry: String(expiry), sig: signature(userId, id, expiry) });
  return "/api/email?" + params;
}

export function verifyEmailDownload(userId: string, id: string, expiry: string | null, sig: string | null) {
  const expires = Number(expiry);
  const now = Math.floor(Date.now() / 1000);
  return Number.isSafeInteger(expires) && expires > now && expires <= now + 60
    && !!sig && /^[a-f0-9]{64}$/.test(sig)
    && timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(signature(userId, id, expires), "hex"));
}

export function emailContentDisposition(name: string) {
  const ascii = name.replace(/[^a-z0-9._ -]/gi, "_");
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (value) => "%" + value.charCodeAt(0).toString(16));
  return 'attachment; filename="' + ascii + '"; filename*=UTF-8' + "''" + encoded;
}
