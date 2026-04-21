import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod/v4";

const rowSchema = z.object({
  title: z.string().min(1).max(200),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  due_date: z.string().nullable().optional(),
  description: z.string().max(5000).nullable().optional(),
});

const importSchema = z.object({
  columnId: z.string().uuid(),
  rows: z.array(rowSchema).min(1).max(500),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ boardId: string }> }
) {
  const { boardId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = importSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  // Find current max position in target column
  const { data: existing, error: existingError } = await supabase
    .from("cards")
    .select("position")
    .eq("column_id", parsed.data.columnId)
    .order("position", { ascending: false })
    .limit(1);

  if (existingError) {
    console.error('[boards/[boardId]/import POST] max-position query failed:', existingError);
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  let nextPosition =
    existing && existing.length > 0 ? existing[0].position + 1 : 0;

  const inserts = parsed.data.rows.map((row) => {
    const due = row.due_date?.trim();
    return {
      board_id: boardId,
      column_id: parsed.data.columnId,
      title: row.title.trim(),
      description: row.description?.trim() || null,
      priority: row.priority,
      due_date: due ? due : null,
      position: nextPosition++,
      created_by: user.id,
    };
  });

  const { data, error } = await supabase
    .from("cards")
    .insert(inserts)
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ created: data?.length ?? 0 });
}
