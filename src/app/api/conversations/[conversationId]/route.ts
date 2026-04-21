import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// DELETE /api/conversations/[conversationId] — admin only, via RPC
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const { conversationId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase.rpc("delete_conversation", {
    p_conversation_id: conversationId,
  });
  if (error) {
    const msg = error.message || "Failed to delete";
    const status = /only admins/i.test(msg) ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
  return NextResponse.json({ ok: true });
}
