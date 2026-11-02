import { NextResponse } from 'next/server';
import { deskSession, deskError, invalid, unauthorized } from '@/lib/service-desk/server';
import { ticketActionSchema, uuid } from '@/lib/service-desk/validation';
export async function POST(request:Request,{params}:{params:Promise<{ticketId:string}>}) {
 const {client,user}=await deskSession();if(!user)return unauthorized();
 const {ticketId}=await params;
 const parsed=ticketActionSchema.safeParse(await request.json().catch(()=>null));
 if(!uuid.safeParse(ticketId).success||!parsed.success)return invalid();
 const {action,...payload}=parsed.data;
 const {data,error}=await client.rpc('desk_ticket_action',{p_ticket:ticketId,p_action:action,p_payload:payload});
 return error?deskError(error):NextResponse.json(data);
}
