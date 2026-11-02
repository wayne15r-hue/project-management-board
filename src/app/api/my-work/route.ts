import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const tab = params.get("tab") ?? "mine";
  const board = params.get("board");
  const search = (params.get("search") ?? "").trim();
  const pageText = params.get("page") ?? "1";
  const page = Number(pageText);
  if (!["mine", "attention"].includes(tab) || !/^\d+$/.test(pageText) || !Number.isSafeInteger(page) || page < 1 || page > 2147483647 || search.length > 200 ||
    (board !== null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(board))) {
    return NextResponse.json({ error: "Invalid My Work filters" }, { status: 400 });
  }
  let timezone = params.get("timezone") ?? "UTC";
  try { new Intl.DateTimeFormat("en", { timeZone: timezone }); } catch { timezone = "UTC"; }
  const { data, error } = await supabase.rpc("my_work", {
    p_tab: tab, p_board: board, p_search: search, p_timezone: timezone, p_page: page,
  });
  if (error) {
    console.error("[my-work] query failed", error.code);
    return NextResponse.json({ error: "Unable to load My Work" }, { status: 500 });
  }
  return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
}
