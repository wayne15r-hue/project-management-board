import { NextResponse } from 'next/server';
import { deskSession, deskTeams, deskError, invalid, unauthorized } from '@/lib/service-desk/server';
import { uuid } from '@/lib/service-desk/validation';
export async function GET(_request:Request,{params}:{params:Promise<{ticketId:string}>}) {
 const {client,user}=await deskSession();if(!user)return unauthorized();
 const {ticketId}=await params;if(!uuid.safeParse(ticketId).success)return invalid();
 const {data:ticket,error}=await client.from('desk_tickets').select('*').eq('id',ticketId).maybeSingle();
 if(error)return deskError(error);if(!ticket)return NextResponse.json({error:'Ticket unavailable'},{status:404});
 try{
  const [teams,comments,activity,approvals,attachments,links]=await Promise.all([
   deskTeams(client),client.from('desk_comments').select('*').eq('ticket_id',ticketId).order('created_at'),
   client.from('desk_activity').select('*').eq('ticket_id',ticketId).order('created_at'),
   client.from('desk_approvals').select('*').eq('ticket_id',ticketId).order('requested_at'),
   client.from('desk_attachments').select('id,file_name,file_size,created_at').eq('ticket_id',ticketId).order('created_at'),
   client.from('desk_ticket_links').select('card_id').eq('ticket_id',ticketId),
  ]);
  if([comments,activity,approvals,attachments,links].some(r=>r.error))throw new Error('detail');
  // RLS on cards independently filters links: ticket access never grants board access.
  const ids=(links.data??[]).map(l=>l.card_id);
  const cards=ids.length?await client.from('cards').select('id,title,board_id').in('id',ids):{data:[],error:null};
  if(cards.error)throw new Error('links');
  const team=teams.find(t=>t.id===ticket.team_id);if(!team)return NextResponse.json({error:'Ticket unavailable'},{status:404});
  return NextResponse.json({ticket,team,comments:comments.data,activity:activity.data,approvals:approvals.data,attachments:attachments.data,links:(cards.data??[]).map(c=>({card_id:c.id,title:c.title,board_id:c.board_id}))});
 }catch{return NextResponse.json({error:'Unable to load ticket details'},{status:500});}
}
