import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createBoardSchema } from "@/lib/validators/board";

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("boards")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = createBoardSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  const { data: board, error } = await supabase
    .from("boards")
    .insert({
      name: parsed.data.name,
      description: parsed.data.description || null,
      owner_id: user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Create default columns
  const defaultColumns = [
    { board_id: board.id, name: "To Do", position: 0, color: "#6366f1" },
    { board_id: board.id, name: "In Progress", position: 1, color: "#f59e0b" },
    { board_id: board.id, name: "Done", position: 2, color: "#22c55e" },
  ];

  const { error: columnsError } = await supabase.from("columns").insert(defaultColumns);
  if (columnsError) {
    console.error('[boards POST] default columns insert failed:', columnsError);
    return NextResponse.json({ error: columnsError.message }, { status: 500 });
  }

  return NextResponse.json(board, { status: 201 });
}
