import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { createClient } from "@/lib/supabase/server";
import { workflowErrorResponse } from "@/lib/workflows/errors";

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("board_invite_inbox");
  if (error) return workflowErrorResponse(error);
  return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const parsed = z.object({ inviteId: z.uuid(), accept: z.boolean() })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid invitation response" }, { status: 400 });

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("board_invite_respond", {
    p_invitation: parsed.data.inviteId,
    p_accept: parsed.data.accept,
  });
  if (error) return workflowErrorResponse(error);
  return NextResponse.json({ boardId: data });
}
