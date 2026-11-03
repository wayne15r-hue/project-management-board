import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { z } from 'zod/v4';
export const invalid=(message='Check the required leave fields and try again.')=>NextResponse.json({error:message},{status:400});
export const unauthorized=()=>NextResponse.json({error:'Unauthorized'},{status:401});
export async function leaveSession(){const client=await createClient();const {data:{user},error}=await client.auth.getUser();return {client,user:error?null:user};}
export function leaveError(error:{code?:string;message?:string}){
 const status=error.code==='42501'?403:['40001','23505','40P01'].includes(error.code??'')?409:error.code?.startsWith('22')||['23502','23503','23514'].includes(error.code??'')?400:500;
 return NextResponse.json({error:status===500?'LeaveDesk is temporarily unavailable. Please retry.':error.message??'Refresh and try again.'},{status,headers:{'Cache-Control':'private, no-store'}});
}
export async function leaveRead(name:string,args:Record<string,unknown>={}){
 const {client,user}=await leaveSession();if(!user)return unauthorized();const {data,error}=await client.rpc(name,args);
 return error?leaveError(error):NextResponse.json(data,{headers:{'Cache-Control':'private, no-store'}});
}
export async function leaveMutation<T>(request:Request,schema:z.ZodType<T>,name:string,args:(input:T)=>Record<string,unknown>,status=200){
 const {client,user}=await leaveSession();if(!user)return unauthorized();
 const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return invalid(parsed.error.issues[0]?.message);
 const {data,error}=await client.rpc(name,args(parsed.data));return error?leaveError(error):NextResponse.json(data??{ok:true},{status,headers:{'Cache-Control':'private, no-store'}});
}
