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

  const { data, error } = await supabase.rpc('account_identity_search',{p_query:q.slice(0,100),p_exclude:user.id,p_limit:20});
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
