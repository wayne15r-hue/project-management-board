import { NextResponse } from 'next/server';
import { deskSession, deskTeams, unauthorized } from '@/lib/service-desk/server';
export async function GET() {
 const {client,user}=await deskSession();if(!user)return unauthorized();
 try{return NextResponse.json({teams:await deskTeams(client)});}catch{return NextResponse.json({error:'Unable to load Service Desk teams'},{status:500});}
}
