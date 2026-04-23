import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const MAX_SIZE = 5 * 1024 * 1024;
const BUCKET = "chat-files";
const BLOCKED_EXT = new Set([
  "exe", "bat", "cmd", "com", "sh", "msi", "scr",
  "vbs", "vbe", "js", "jse", "wsf", "wsh", "ps1",
  "jar", "dll", "app", "deb", "rpm", "apk",
]);

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ conversationId: string }> }
) {
  const { conversationId } = await ctx.params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: isMember, error: memberError } = await supabase.rpc(
    "is_conversation_member",
    { conv_id: conversationId }
  );
  if (memberError) {
    console.error(
      "[conversations/[conversationId]/upload POST] membership check failed:",
      memberError
    );
    return NextResponse.json({ error: memberError.message }, { status: 500 });
  }
  if (!isMember) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: "File too large (max 5MB)" },
      { status: 400 }
    );
  }

  const dotIdx = file.name.lastIndexOf(".");
  const ext = dotIdx >= 0 ? file.name.slice(dotIdx + 1).toLowerCase() : "";
  if (ext && BLOCKED_EXT.has(ext)) {
    return NextResponse.json(
      { error: "File type not allowed for security reasons." },
      { status: 400 }
    );
  }

  const safeExt = ext ? `.${ext.replace(/[^a-zA-Z0-9]/g, "")}` : "";
  const path = `${conversationId}/${Date.now()}_${crypto.randomUUID()}${safeExt}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
  if (uploadError) {
    console.error(
      "[conversations/[conversationId]/upload POST] storage upload failed:",
      uploadError
    );
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: signed, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 7);
  if (signError || !signed?.signedUrl) {
    console.error(
      "[conversations/[conversationId]/upload POST] sign url failed:",
      signError
    );
    try {
      await supabase.storage.from(BUCKET).remove([path]);
    } catch {
      /* ignore */
    }
    return NextResponse.json(
      { error: signError?.message || "Could not sign URL" },
      { status: 500 }
    );
  }

  const isImage = (file.type || "").startsWith("image/");
  const messageType = isImage ? "image" : "file";

  const { data: message, error: insertError } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_id: user.id,
      content: null,
      message_type: messageType,
      file_url: signed.signedUrl,
      file_name: file.name,
      file_size: file.size,
      file_type: file.type || "application/octet-stream",
    })
    .select(
      "id, conversation_id, sender_id, content, message_type, file_url, file_name, file_size, file_type, reply_to_id, edited_at, created_at, sender:profiles!messages_sender_id_fkey(id, full_name, email, avatar_url)"
    )
    .single();

  if (insertError) {
    console.error(
      "[conversations/[conversationId]/upload POST] message insert failed:",
      insertError
    );
    try {
      await supabase.storage.from(BUCKET).remove([path]);
    } catch {
      /* ignore */
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  await supabase
    .from("conversation_members")
    .update({ last_read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .eq("user_id", user.id);

  return NextResponse.json(message, { status: 201 });
}
