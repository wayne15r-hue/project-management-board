import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { updateCardSchema } from "@/lib/validators/card";
import { logActivity } from "@/lib/activity";
import { createNotification } from "@/lib/notifications";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ cardId: string }> }
) {
  const { cardId } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("cards")
    .select(
      `
      *,
      assignee:profiles!cards_assignee_id_fkey (id, full_name, avatar_url, email)
    `
    )
    .eq("id", cardId)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ cardId: string }> }
) {
  const { cardId } = await params;
  const supabase = await createClient();

  const body = await request.json();
  const parsed = updateCardSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (parsed.data.title !== undefined) updateData.title = parsed.data.title;
  if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
  if (parsed.data.priority !== undefined) updateData.priority = parsed.data.priority;
  if (parsed.data.column_id !== undefined) updateData.column_id = parsed.data.column_id;
  if (parsed.data.position !== undefined) updateData.position = parsed.data.position;
  if (parsed.data.due_date !== undefined) updateData.due_date = parsed.data.due_date;
  if (parsed.data.start_date !== undefined) updateData.start_date = parsed.data.start_date;
  if (parsed.data.assignee_id !== undefined) updateData.assignee_id = parsed.data.assignee_id;
  if (parsed.data.recurrence_rule !== undefined) updateData.recurrence_rule = parsed.data.recurrence_rule;
  if (parsed.data.cover_color !== undefined) updateData.cover_color = parsed.data.cover_color;

  // Fetch existing card for change tracking
  const { data: existing, error: existingError } = await supabase
    .from("cards")
    .select("*, assignee:profiles!cards_assignee_id_fkey(full_name)")
    .eq("id", cardId)
    .single();

  if (existingError) {
    console.error('[cards/[cardId] PATCH] existing card fetch failed:', existingError);
    return NextResponse.json({ error: existingError.message }, { status: existingError.code === "PGRST116" ? 404 : 500 });
  }

  const { data, error } = await supabase
    .from("cards")
    .update(updateData)
    .eq("id", cardId)
    .select(
      `
      *,
      assignee:profiles!cards_assignee_id_fkey (id, full_name, avatar_url, email)
    `
    )
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Log activity
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user && existing) {
    const changes: Record<string, unknown> = {};
    if (parsed.data.title && parsed.data.title !== existing.title)
      changes.title = parsed.data.title;
    if (parsed.data.priority && parsed.data.priority !== existing.priority)
      changes.priority = parsed.data.priority;
    if (parsed.data.column_id && parsed.data.column_id !== existing.column_id) {
      // Resolve column name
      const { data: col } = await supabase
        .from("columns")
        .select("name")
        .eq("id", parsed.data.column_id)
        .single();
      changes.column_name = col?.name;
    }
    if (parsed.data.assignee_id !== undefined && parsed.data.assignee_id !== existing.assignee_id) {
      changes.assignee_name = data.assignee?.full_name || "Unassigned";
    }
    if (parsed.data.due_date !== undefined) changes.due_date = parsed.data.due_date;
    if (parsed.data.description !== undefined) changes.description = true;

    const action = changes.column_name
      ? "moved"
      : changes.assignee_name
        ? "assigned"
        : "updated";

    if (Object.keys(changes).length > 0) {
      logActivity({ cardId, actorId: user.id, action, changes });
    }
  }

  // Assignment notification (in-app + email) if assignee changed
  if (
    parsed.data.assignee_id &&
    existing &&
    parsed.data.assignee_id !== existing.assignee_id &&
    user &&
    parsed.data.assignee_id !== user.id
  ) {
    createNotification({
      recipientId: parsed.data.assignee_id,
      actorId: user.id,
      type: "assignment",
      cardId: data.id,
      boardId: data.board_id,
      title: `You were assigned to "${data.title}"`,
      email: { kind: "assignment", cardTitle: data.title },
    }).catch((e) => console.error("assignment notification failed:", e));
  }

  // Handle recurring task: when moved to the last column, create a new card in the first column
  if (
    parsed.data.column_id &&
    existing &&
    parsed.data.column_id !== existing.column_id &&
    data.recurrence_rule
  ) {
    // Fire-and-forget to avoid blocking the response
    (async () => {
      try {
        // Get all columns for this board, ordered by position
        const { data: columns } = await supabase
          .from("columns")
          .select("id, position")
          .eq("board_id", data.board_id)
          .order("position", { ascending: true });

        if (!columns || columns.length < 2) return;

        const lastColumn = columns[columns.length - 1];
        const firstColumn = columns[0];

        // Only trigger if moved to the last column
        if (parsed.data.column_id !== lastColumn.id) return;

        // Calculate new due date based on recurrence rule
        let newDueDate: string | null = null;
        if (data.due_date) {
          const base = new Date(data.due_date);
          switch (data.recurrence_rule) {
            case "daily":
              base.setDate(base.getDate() + 1);
              break;
            case "weekly":
              base.setDate(base.getDate() + 7);
              break;
            case "biweekly":
              base.setDate(base.getDate() + 14);
              break;
            case "monthly":
              base.setMonth(base.getMonth() + 1);
              break;
          }
          newDueDate = base.toISOString();
        }

        // Get current max position in the first column
        const { data: maxCard } = await supabase
          .from("cards")
          .select("position")
          .eq("column_id", firstColumn.id)
          .order("position", { ascending: false })
          .limit(1)
          .single();

        const newPosition = (maxCard?.position ?? -1) + 1;

        // Create the recurring copy
        const { data: newCard } = await supabase
          .from("cards")
          .insert({
            column_id: firstColumn.id,
            board_id: data.board_id,
            title: data.title,
            description: data.description,
            priority: data.priority,
            position: newPosition,
            due_date: newDueDate,
            start_date: null,
            assignee_id: data.assignee_id,
            created_by: data.created_by,
            recurrence_rule: data.recurrence_rule,
            recurrence_parent_id: data.id,
          })
          .select()
          .single();

        // Copy labels from original card to new card
        if (newCard) {
          const { data: labels } = await supabase
            .from("card_labels")
            .select("label_id")
            .eq("card_id", cardId);

          if (labels && labels.length > 0) {
            await supabase.from("card_labels").insert(
              labels.map((l) => ({
                card_id: newCard.id,
                label_id: l.label_id,
              }))
            );
          }
        }
      } catch (err) {
        console.error("Failed to create recurring card:", err);
      }
    })();
  }

  return NextResponse.json(data);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ cardId: string }> }
) {
  const { cardId } = await params;
  const supabase = await createClient();

  const { error } = await supabase.from("cards").delete().eq("id", cardId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
