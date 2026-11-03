import { NextResponse } from 'next/server';
import { runAccountMaintenance } from '@/lib/accounts/worker';
export const maxDuration=30;
// Cookie-free fixed-purpose queue drain. Never consumes request targets or payloads.
export async function POST(){
 try{await runAccountMaintenance();return NextResponse.json({ok:true});}
 catch{return NextResponse.json({error:'Maintenance unavailable'},{status:503});}
}
