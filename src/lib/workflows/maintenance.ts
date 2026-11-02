import { Resend } from 'resend';
import { createAdminClient } from '@/lib/supabase/admin';
type Delivery={id:string;lease_token:string;payload:{to:string;subject:string;text:string;from:string};provider_key:string};
async function bounded<T>(promise:Promise<T>,milliseconds:number):Promise<T>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([promise,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Provider timeout')),milliseconds);})]);}
 finally{if(timer) clearTimeout(timer);}
}
/** Fixed-purpose, bounded worker. PostgreSQL owns state, eligibility, leases and retries. */
export async function runWorkflowMaintenance():Promise<void>{
 const db=createAdminClient();
 const gate=await db.rpc('workflow_begin_maintenance');
 if(gate.error) throw new Error('Workflow maintenance unavailable');
 if(gate.data!==true) return;
 const generated=await db.rpc('workflow_generate');
 if(generated.error) throw new Error('Workflow generation unavailable');
 const from=process.env.RESEND_FROM?.trim();
 const configured=!!from&&!!process.env.RESEND_API_KEY?.trim();
 const {data,error}=await db.rpc('workflow_claim_deliveries',{p_email_enabled:configured,p_from:from??'',p_app_url:process.env.NEXT_PUBLIC_APP_URL??'http://localhost:3000'});
 if(error) throw new Error('Workflow delivery unavailable');
 const resend=configured?new Resend(process.env.RESEND_API_KEY):null;
 const deadline=Date.now()+20_000;
 for(const delivery of (data??[]) as Delivery[]){
  if(Date.now()>=deadline) break; // Unused leases expire safely; do not exceed the HTTP runtime budget.
  // Revalidate immediately before transport; a stale or revoked delivery is cancelled.
  const valid=await db.rpc('workflow_validate_lease',{p_id:delivery.id,p_token:delivery.lease_token});
  if(valid.error||valid.data!==true) continue;
  let outcome='ambiguous'; let providerId:string|null=null;
  try{
   const result=await bounded(resend!.emails.send(delivery.payload,{idempotencyKey:delivery.provider_key}),Math.min(3000,Math.max(1,deadline-Date.now())));
   if(result.error){
    const code=Number((result.error as {statusCode?:number}).statusCode??0);
    outcome=code===429||code>=500||['rate_limit_exceeded','application_error','internal_server_error'].includes(result.error.name)?'transient':code>=400&&code<500?'permanent':'ambiguous';
   }else if(result.data?.id){outcome='accepted';providerId=result.data.id;}
  }catch{outcome='ambiguous';}
  const finished=await db.rpc('workflow_finish_delivery',{p_id:delivery.id,p_token:delivery.lease_token,p_outcome:outcome,p_provider_id:providerId});
  if(finished.error) throw new Error('Workflow acknowledgement unavailable');
 }
}
