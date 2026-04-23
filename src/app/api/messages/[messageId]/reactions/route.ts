import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ messageId: string }> }
) {
  const { messageId } = await ctx.params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const emoji =
    body && typeof body.emoji === "string" ? body.emoji.trim() : "";
  if (!emoji || emoji.length > 32) {
    return NextResponse.json({ error: "Invalid emoji" }, { status: 400 });
  }

  const { data: message, error: msgError } = await supabase
    .from("messages")
    .select("id, conversation_id")
    .eq("id", messageId)
    .maybeSingle();
  if (msgError) {
    console.error(
      "[messages/[messageId]/reactions POST] message lookup failed:",
      msgError
    );
    return NextResponse.json({ error: msgError.message }, { status: 500 });
  }
  if (!message) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: isMember, error: memberError } = await supabase.rpc(
    "is_conversation_member",
    { conv_id: message.conversation_id }
  );
  if (memberError) {
    console.error(
      "[messages/[messageId]/reactions POST] membership check failed:",
      memberError
    );
    return NextResponse.json({ error: memberError.message }, { status: 500 });
  }
  if (!isMember) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: existing, error: existingError } = await supabase
    .from("message_reactions")
    .select("message_id")
    .eq("message_id", messageId)
    .eq("user_id", user.id)
    .eq("emoji", emoji)
    .maybeSingle();
  if (existingError) {
    console.error(
      "[messages/[messageId]/reactions POST] existing lookup failed:",
      existingError
    );
    return NextResponse.json(
      { error: existingError.message },
      { status: 500 }
    );
  }

  if (existing) {
    const { error: deleteError } = await supabase
      .from("message_reactions")
      .delete()
      .eq("message_id", messageId)
      .eq("user_id", user.id)
      .eq("emoji", emoji);
    if (deleteError) {
      console.error(
        "[messages/[messageId]/reactions POST] delete failed:",
        deleteError
      );
      return NextResponse.json(
        { error: deleteError.message },
        { status: 500 }
      );
    }
    return NextResponse.json({ action: "removed", emoji });
  }

  const { error: insertError } = await supabase
    .from("message_reactions")
    .insert({ message_id: messageId, user_id: user.id, emoji });
  if (insertError) {
    console.error(
      "[messages/[messageId]/reactions POST] insert failed:",
      insertError
    );
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }
  return NextResponse.json({ action: "added", emoji });
}
