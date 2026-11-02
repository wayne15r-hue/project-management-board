import { NextResponse } from 'next/server';
import { deskSession, deskError, deskTeams, invalid, unauthorized } from '@/lib/service-desk/server';
import { createTicketSchema, listSchema } from '@/lib/service-desk/validation';
import type { DeskView } from '@/types/service-desk';
export async function POST(request:Request) {
 const {client,user}=await deskSession();if(!user)return unauthorized();
 const parsed=createTicketSchema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return invalid(parsed.error.issues[0]?.message);
 const {teamId,...payload}=parsed.data;
 const {data,error}=await client.rpc('desk_create_ticket',{p_team:teamId,p_payload:payload});
 return error?deskError(error):NextResponse.json(data,{status:201});
}
export async function GET(request:Request) {
 const {client,user}=await deskSession();if(!user)return unauthorized();
 const parsed=listSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
 if(!parsed.success)return invalid();
 const p=parsed.data;
 try{
  const teams=await deskTeams(client);const supportIds=teams.filter(t=>t.support).map(t=>t.id);
  const query=(view:DeskView,head=false)=>{
   let q=client.from('desk_tickets').select('*',{count:'exact',head});
   if(view==='mine')q=q.eq('requester_id',user.id);
   if(view==='queue')q=q.in('team_id',supportIds);
   if(view==='reviews')q=q.eq('approver_id',user.id).eq('approval_status','pending');
   if(view==='assigned')q=q.eq('assignee_id',user.id).in('team_id',supportIds).not('status','in','(resolved,closed,cancelled)');
   if(p.team)q=q.eq('team_id',p.team);
   if(p.type)q=q.eq('type',p.type);if(p.status)q=q.eq('status',p.status);if(p.priority)q=q.eq('priority',p.priority);if(p.assignee)q=q.eq('assignee_id',p.assignee);
   if(p.search){const ref=/^SD-(\d+)$/i.exec(p.search);q=ref?q.eq('number',Number(ref[1])):q.ilike('title',`%${p.search.replace(/[\\%_]/g,'\\$&')}%`);}
   return q;
  };
  const views=['mine','queue','reviews','assigned'] as const;
  const [list,...counts]=await Promise.all([query(p.view).order('created_at',{ascending:false}).order('id').range((p.page-1)*25,p.page*25-1),...views.map(v=>query(v,true))]);
  if(list.error||counts.some(c=>c.error))return NextResponse.json({error:'Unable to load tickets'},{status:500});
  return NextResponse.json({items:list.data??[],total:list.count??0,page:p.page,pageSize:25,counts:Object.fromEntries(views.map((v,i)=>[v,counts[i].count??0]))});
 }catch{return NextResponse.json({error:'Unable to load tickets'},{status:500});}
}
