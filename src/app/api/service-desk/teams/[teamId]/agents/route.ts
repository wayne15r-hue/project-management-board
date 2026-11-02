import { NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { deskSession, deskError, invalid, unauthorized } from '@/lib/service-desk/server';
import { uuid } from '@/lib/service-desk/validation';
const schema=z.object({userId:uuid,enabled:z.boolean()});
export async function POST(request:Request,{params}:{params:Promise<{teamId:string}>}) {
 const {client,user}=await deskSession();if(!user)return unauthorized();
 const {teamId}=await params;const body=schema.safeParse(await request.json().catch(()=>null));
 if(!uuid.safeParse(teamId).success||!body.success)return invalid();
 const {error}=await client.rpc('desk_set_agent',{p_team:teamId,p_user:body.data.userId,p_enabled:body.data.enabled});
 return error?deskError(error):NextResponse.json({ok:true});
}
