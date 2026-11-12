import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { createClient } from "@/lib/supabase/server";
import { workflowErrorResponse } from "@/lib/workflows/errors";

type Context = { params: Promise<{ boardId: string }> };

export async function GET(_request: Request, { params }: Context) {
  const { boardId } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("board_share_context", { p_board: boardId });
  if (error) return workflowErrorResponse(error);
  return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request, { params }: Context) {
  const parsed = z.object({ email: z.string().trim().max(254).pipe(z.email()) })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });

  const { boardId } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("board_invite_send", {
    p_board: boardId,
    p_email: parsed.data.email,
  });
  if (error) return workflowErrorResponse(error);
  return NextResponse.json({ id: data }, { status: 201 });
}

export async function DELETE(request: Request, { params }: Context) {
  const parsed = z.object({ inviteId: z.uuid() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid invitation" }, { status: 400 });

  const { boardId } = await params;
  const supabase = await createClient();
  const { error } = await supabase.rpc("board_invite_cancel", {
    p_board: boardId,
    p_invitation: parsed.data.inviteId,
  });
  if (error) return workflowErrorResponse(error);
  return new Response(null, { status: 204 });
}
