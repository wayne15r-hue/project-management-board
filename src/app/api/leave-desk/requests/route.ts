import { leaveMutation,invalid,leaveSession,unauthorized,leaveError } from '@/lib/leave-desk/server';
import { submitSchema,listSchema } from '@/lib/leave-desk/validation';
import { NextResponse } from 'next/server';
export async function GET(request:Request){
 const {client,user}=await leaveSession();if(!user)return unauthorized();
 const p=listSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));if(!p.success)return invalid();
 const {data,error}=await client.rpc('leave_list',{p_view:p.data.view});return error?leaveError(error):NextResponse.json(data,{headers:{'Cache-Control':'private, no-store'}});
}
export async function POST(request:Request){return leaveMutation(request,submitSchema,'leave_submit',({key,...payload})=>({p_payload:payload,p_key:key}),201);}
