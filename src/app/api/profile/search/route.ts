import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/profile/search?q=... — find people to start a chat with
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";

  let query = supabase
    .from("profiles")
    .select("id, full_name, email, avatar_url")
    .neq("id", user.id)
    .limit(20);

  if (q) {
    query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`);
  }

  const { data, error } = await query;
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
