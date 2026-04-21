import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod/v4";

const updateSchema = z.object({
  text: z.string().min(1).max(2000),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ cardId: string; commentId: string }> }
) {
  const { commentId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  const { data: existing, error: fetchErr } = await supabase
    .from("activity_log")
    .select("id, actor_id, action, changes")
    .eq("id", commentId)
    .single();

  if (fetchErr || !existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (existing.actor_id !== user.id || existing.action !== "commented") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const prevChanges =
    (existing.changes as Record<string, unknown> | null) ?? {};

  const { data, error } = await supabase
    .from("activity_log")
    .update({
      changes: { ...prevChanges, text: parsed.data.text, edited: true },
    })
    .eq("id", commentId)
    .select(
      "*, actor:profiles!activity_log_actor_id_fkey(id, full_name, avatar_url, email)"
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ cardId: string; commentId: string }> }
) {
  const { commentId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: existing, error: existingError } = await supabase
    .from("activity_log")
    .select("id, actor_id, action")
    .eq("id", commentId)
    .single();

  if (existingError && existingError.code !== "PGRST116") {
    console.error('[cards/[cardId]/comments/[commentId] DELETE] fetch failed:', existingError);
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (existing.actor_id !== user.id || existing.action !== "commented") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await supabase
    .from("activity_log")
    .delete()
    .eq("id", commentId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
