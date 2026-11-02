import { NextResponse } from 'next/server';
import { runWorkflowMaintenance } from '@/lib/workflows/maintenance';
export const maxDuration=30;
// Public fixed-purpose wakeup: no supplied identities, targets or payloads are consumed.
// A service-only DB gate and delivery leases bound work across all instances.
export async function POST(){
 try{await runWorkflowMaintenance();return NextResponse.json({ok:true});}
 catch{return NextResponse.json({error:'Maintenance unavailable'},{status:503});}
}
