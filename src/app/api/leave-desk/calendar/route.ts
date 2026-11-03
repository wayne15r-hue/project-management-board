import { NextResponse } from 'next/server';
import { leaveSession,unauthorized,invalid,leaveError } from '@/lib/leave-desk/server';
import { calendarSchema } from '@/lib/leave-desk/validation';
export async function GET(request:Request){const {client,user}=await leaveSession();if(!user)return unauthorized();const p=calendarSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));if(!p.success)return invalid(p.error.issues[0]?.message);const {data,error}=await client.rpc('leave_calendar',{p_start:p.data.start,p_end:p.data.end,p_department:p.data.department??null});return error?leaveError(error):NextResponse.json(data,{headers:{'Cache-Control':'private, no-store'}});}
