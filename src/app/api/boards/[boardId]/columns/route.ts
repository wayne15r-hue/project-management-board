import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  createColumnSchema,
  updateColumnsSchema,
  deleteColumnSchema,
} from "@/lib/validators/board";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ boardId: string }> }
) {
  const { boardId } = await params;
  const supabase = await createClient();

  const body = await request.json();
  const parsed = createColumnSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  // Get max position
  const { data: existing, error: existingError } = await supabase
    .from("columns")
    .select("position")
    .eq("board_id", boardId)
    .order("position", { ascending: false })
    .limit(1);

  if (existingError) {
    console.error('[boards/[boardId]/columns POST] max-position query failed:', existingError);
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  const nextPosition = existing && existing.length > 0 ? existing[0].position + 1 : 0;

  const { data, error } = await supabase
    .from("columns")
    .insert({
      board_id: boardId,
      name: parsed.data.name,
      position: nextPosition,
      color: parsed.data.color || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ boardId: string }> }
) {
  const { boardId } = await params;
  const supabase = await createClient();

  const body = await request.json();
  const parsed = updateColumnsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  // Batch update columns
  const updates = parsed.data.columns.map((col) =>
    supabase
      .from("columns")
      .update({
        ...(col.name !== undefined && { name: col.name }),
        ...(col.position !== undefined && { position: col.position }),
        ...(col.color !== undefined && { color: col.color }),
      })
      .eq("id", col.id)
      .eq("board_id", boardId)
  );

  const results = await Promise.all(updates);
  const firstErr = results.find((r) => r.error)?.error;
  if (firstErr) {
    console.error('[boards/[boardId]/columns PATCH] batch update failed:', firstErr);
    return NextResponse.json({ error: firstErr.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ boardId: string }> }
) {
  const { boardId } = await params;
  const supabase = await createClient();

  const body = await request.json();
  const parsed = deleteColumnSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  const { error } = await supabase.rpc("delete_board_column", {
    p_board_id: boardId,
    p_column_id: parsed.data.columnId,
  });
  if (error) return NextResponse.json({ error: error.message }, {
    status: error.code === "42501" ? 403 : error.code === "22023" ? 400 : 500,
  });
  return NextResponse.json({ success: true });
}
