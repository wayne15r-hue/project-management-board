import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createCardSchema } from "@/lib/validators/card";
import { createNotification } from "@/lib/notifications";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ boardId: string }> }
) {
  const { boardId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = createCardSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  // Get max position in column
  const { data: existing, error: existingError } = await supabase
    .from("cards")
    .select("position")
    .eq("column_id", parsed.data.columnId)
    .order("position", { ascending: false })
    .limit(1);

  if (existingError) {
    console.error('[boards/[boardId]/cards POST] max-position query failed:', existingError);
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  const nextPosition = existing && existing.length > 0 ? existing[0].position + 1 : 0;

  const { data, error } = await supabase
    .from("cards")
    .insert({
      board_id: boardId,
      column_id: parsed.data.columnId,
      title: parsed.data.title,
      description: parsed.data.description || null,
      priority: parsed.data.priority,
      position: nextPosition,
      due_date: parsed.data.due_date || null,
      start_date: parsed.data.start_date || null,
      assignee_id: parsed.data.assignee_id || null,
      created_by: user.id,
    })
    .select(
      `
      *,
      assignee:profiles!cards_assignee_id_fkey (id, full_name, avatar_url, email)
    `
    )
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (data.assignee_id && data.assignee_id !== user.id) {
    createNotification({
      recipientId: data.assignee_id,
      actorId: user.id,
      type: "assignment",
      cardId: data.id,
      boardId: data.board_id,
      title: `You were assigned to "${data.title}"`,
      email: { kind: "assignment", cardTitle: data.title },
    }).catch((e) => console.error("assignment notification failed:", e));
  }

  return NextResponse.json(data, { status: 201 });
}
