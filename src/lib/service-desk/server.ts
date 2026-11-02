import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { workflowErrorResponse } from '@/lib/workflows/errors';
import type { DeskTeam } from '@/types/service-desk';
export async function deskSession() {
 const client=await createClient();
 const {data:{user},error}=await client.auth.getUser();
 return {client,user:error?null:user};
}
export const invalid = (message='Invalid Service Desk request') => NextResponse.json({error:message},{status:400});
export const unauthorized = () => NextResponse.json({error:'Unauthorized'},{status:401});
export function deskError(error:{code?:string;message?:string}) {
 if(error.code==='23502')return invalid('Required ticket information is missing');
 return workflowErrorResponse(error);
}
export async function deskTeams(client:Awaited<ReturnType<typeof createClient>>):Promise<DeskTeam[]> {
 const {data,error}=await client.rpc('desk_context');
 if(error)throw new Error('Unable to load Service Desk teams');
 return (data??[]) as DeskTeam[];
}
