import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod/v4";

const createFieldSchema = z.object({
  name: z.string().min(1).max(100),
  field_type: z.enum(["text", "number", "date", "select"]),
  options: z.array(z.string()).optional(),
});

const updateFieldSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100).optional(),
  options: z.array(z.string()).optional(),
  position: z.number().int().min(0).optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ boardId: string }> }
) {
  const { boardId } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("custom_field_definitions")
    .select("*")
    .eq("board_id", boardId)
    .order("position");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ boardId: string }> }
) {
  const { boardId } = await params;
  const supabase = await createClient();

  const body = await request.json();
  const parsed = createFieldSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  // Get next position
  const { data: existing, error: existingError } = await supabase
    .from("custom_field_definitions")
    .select("position")
    .eq("board_id", boardId)
    .order("position", { ascending: false })
    .limit(1);

  if (existingError) {
    console.error('[boards/[boardId]/custom-fields POST] max-position query failed:', existingError);
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  const nextPosition = existing && existing.length > 0 ? existing[0].position + 1 : 0;

  const { data, error } = await supabase
    .from("custom_field_definitions")
    .insert({
      board_id: boardId,
      name: parsed.data.name,
      field_type: parsed.data.field_type,
      options: parsed.data.options || null,
      position: nextPosition,
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
  const parsed = updateFieldSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.options !== undefined) updateData.options = parsed.data.options;
  if (parsed.data.position !== undefined) updateData.position = parsed.data.position;

  const { data, error } = await supabase
    .from("custom_field_definitions")
    .update(updateData)
    .eq("id", parsed.data.id)
    .eq("board_id", boardId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ boardId: string }> }
) {
  const { boardId } = await params;
  const supabase = await createClient();

  const { fieldId } = await request.json();

  const { error } = await supabase
    .from("custom_field_definitions")
    .delete()
    .eq("id", fieldId)
    .eq("board_id", boardId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
