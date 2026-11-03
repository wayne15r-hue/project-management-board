import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { uuid } from '@/lib/service-desk/validation';
import { leaveError } from '@/lib/leave-desk/server';

export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if(id.startsWith('leave:')){
    const notificationId=id.slice(6);
    if(!uuid.safeParse(notificationId).success)return NextResponse.json({error:'Invalid notification'},{status:400});
    const {error}=await supabase.rpc('leave_mark_notifications_read',{p_id:notificationId});
    return error?leaveError(error):NextResponse.json({ok:true});
  }
  if(id.startsWith('desk:')){
    const ticketNotificationId=id.slice(5);
    if(!uuid.safeParse(ticketNotificationId).success)return NextResponse.json({error:'Invalid notification'},{status:400});
    const {error}=await supabase.from('desk_notifications').update({read_at:new Date().toISOString()}).eq('id',ticketNotificationId).eq('recipient_id',user.id).is('read_at',null);
    return error?NextResponse.json({error:'Unable to mark notification read'},{status:500}):NextResponse.json({ok:true});
  }

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("recipient_id", user.id)
    .is("read_at", null);

  if (error) {
    console.error("[notifications/[id]/read POST] update failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
