import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod/v4";

const setFieldValueSchema = z.object({
  fieldId: z.string().uuid(),
  value: z.unknown(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ cardId: string }> }
) {
  const { cardId } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("custom_field_values")
    .select("*, field_definition:custom_field_definitions(*)")
    .eq("card_id", cardId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ cardId: string }> }
) {
  const { cardId } = await params;
  const supabase = await createClient();

  const body = await request.json();
  const parsed = setFieldValueSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("custom_field_values")
    .upsert(
      {
        card_id: cardId,
        field_id: parsed.data.fieldId,
        value: parsed.data.value as Record<string, unknown>,
      },
      { onConflict: "card_id,field_id" }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
