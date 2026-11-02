import { NextResponse } from 'next/server';
import { POST } from '@/app/api/notifications/maintenance/route';
export async function GET(request:Request){
 const secret=process.env.CRON_SECRET?.trim();
 if(!secret||request.headers.get('authorization')!==`Bearer ${secret}`) return NextResponse.json({error:'Unauthorized'},{status:401});
 return POST();
}
