import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { updateBoardSchema } from "@/lib/validators/board";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ boardId: string }> }
) {
  const { boardId } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("boards")
    .select(
      `
      *,
      columns (
        *,
        cards (
          *,
          assignee:profiles!cards_assignee_id_fkey (id, full_name, avatar_url, email)
        )
      )
    `
    )
    .eq("id", boardId)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  // Sort columns by position, cards by position
  if (data.columns) {
    data.columns.sort((a: { position: number }, b: { position: number }) => a.position - b.position);
    data.columns.forEach((col: { cards?: { position: number }[] }) => {
      if (col.cards) {
        col.cards.sort((a: { position: number }, b: { position: number }) => a.position - b.position);
      }
    });
  }

  return NextResponse.json(data);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ boardId: string }> }
) {
  const { boardId } = await params;
  const supabase = await createClient();

  const body = await request.json();
  const parsed = updateBoardSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("boards")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", boardId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ boardId: string }> }
) {
  const { boardId } = await params;
  const supabase = await createClient();

  const { error } = await supabase.from("boards").delete().eq("id", boardId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
