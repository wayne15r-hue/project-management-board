import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { createClient } from "@/lib/supabase/server";
import { workflowError } from "@/lib/workflows/errors";
import type { ApprovalDetails } from "@/types/approvals";

const operation = { operationId: z.uuid(), expectedRevision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER) };
const note = z.string().trim().max(2000).optional();
const transition = z.discriminatedUnion("action", [
  z.object({ ...operation, action: z.literal("configure"), required: z.boolean(), reviewerId: z.uuid().nullable(), reason: note }).strict(),
  z.object({ ...operation, action: z.literal("request"), reviewDueDate: z.iso.date() }).strict(),
  z.object({ ...operation, action: z.literal("approve"), requestId: z.uuid(), note }).strict(),
  z.object({ ...operation, action: z.literal("request_changes"), requestId: z.uuid(), note: z.string().trim().min(1).max(2000) }).strict(),
  z.object({ ...operation, action: z.literal("withdraw"), requestId: z.uuid(), note }).strict(),
]);
type Context = { params: Promise<{ cardId: string }> };

export async function GET(_request: Request, { params }: Context) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { cardId } = await params;
  if (!z.uuid().safeParse(cardId).success) return NextResponse.json({ error: "Invalid task ID" }, { status: 400 });
  const { data, error } = await supabase.rpc("get_card_approval", { p_card_id: cardId });
  if (error) { const result = workflowError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
  return NextResponse.json(data as ApprovalDetails);
}

export async function POST(request: Request, { params }: Context) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { cardId } = await params;
  if (!z.uuid().safeParse(cardId).success) return NextResponse.json({ error: "Invalid task ID" }, { status: 400 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = transition.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid approval action" }, { status: 400 });
  const { action, ...payload } = parsed.data;
  const { data, error } = await supabase.rpc("transition_card_approval", { p_card_id: cardId, p_action: action, p_payload: payload });
  if (error) { const result = workflowError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
  return NextResponse.json(data as ApprovalDetails);
}
