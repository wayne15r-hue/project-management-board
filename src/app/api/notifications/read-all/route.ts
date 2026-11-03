import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { leaveError } from '@/lib/leave-desk/server';

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase.rpc('desk_mark_all_notifications_read');

  if (error) {
    console.error("[notifications/read-all POST] update failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const {error:leave}=await supabase.rpc('leave_mark_notifications_read',{p_id:null});
  return leave?leaveError(leave):NextResponse.json({ ok: true });
}
