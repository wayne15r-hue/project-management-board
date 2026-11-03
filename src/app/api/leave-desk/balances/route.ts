import { NextResponse } from 'next/server';
import { leaveSession,unauthorized,invalid,leaveError } from '@/lib/leave-desk/server';
import { balanceSchema } from '@/lib/leave-desk/validation';
export async function GET(request:Request){const {client,user}=await leaveSession();if(!user)return unauthorized();const p=balanceSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));if(!p.success)return invalid();const {data,error}=await client.rpc('leave_balances',{p_user:p.data.user??null});return error?leaveError(error):NextResponse.json(data,{headers:{'Cache-Control':'private, no-store'}});}
