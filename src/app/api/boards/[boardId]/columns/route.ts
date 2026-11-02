import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { workflowError } from "@/lib/workflows/errors";
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

  const { data, error } = await supabase.rpc("create_board_column", {
    p_board_id: boardId, p_name: parsed.data.name, p_color: parsed.data.color || null,
  });
  if (error) { const result=workflowError(error); return NextResponse.json({error:result.message},{status:result.status}); }
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

  const { error } = await supabase.rpc("update_board_columns", {
    p_board_id: boardId, p_columns: parsed.data.columns,
  });
  if (error) { const result=workflowError(error); return NextResponse.json({error:result.message},{status:result.status}); }
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
  if (error) { const result=workflowError(error); return NextResponse.json({error:result.message},{status:result.status}); }
  return NextResponse.json({ success: true });
}
