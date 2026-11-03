import { createClient } from '@supabase/supabase-js';
import { drainMediaCleanup } from '@/lib/calls/cleanup';
import { processAccountOperation, type AccountTransport } from './worker-core';
import type { AccountOperation } from '@/types/accounts';

/** Provider calls have no browser session and a bounded network deadline. */
function providerClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
    global:{fetch:(input,init)=>fetch(input,{...init,signal:init?.signal?AbortSignal.any([init.signal,AbortSignal.timeout(5000)]):AbortSignal.timeout(5000)})},
  });
}
export async function runAccountMaintenance(deadline=Date.now()+25000):Promise<void> {
  const db=providerClient();
  const gate=await db.rpc('account_begin_maintenance');
  if(gate.error)throw new Error('Account maintenance unavailable');
  if(gate.data!==true)return;
  const {data,error}=await db.rpc('account_claim_operations');
  if(error)throw new Error('Account maintenance unavailable');
  const operations=(data??[]) as AccountOperation[];
  const transport:AccountTransport={
    async validate(op){
      if(Date.now()>deadline)return false;
      const r=await db.rpc('account_validate_operation',{p_id:op.id,p_lease:op.lease_token});
      if(r.error)throw new Error('Account validation unavailable');return r.data===true;
    },
    async authUser(id){const r=await db.auth.admin.getUserById(id);if(r.error)throw r.error;return r.data.user;},
    async resetEmail(email,redirectTo){
      const operation=operations[0];
      const begun=await db.rpc('account_begin_reset',{p_id:operation.id,p_lease:operation.lease_token});
      if(begun.error||begun.data!==true)throw new Error('Reset authorization changed');
      const r=await db.auth.resetPasswordForEmail(email,{redirectTo});if(r.error)throw r.error;
    },
    async ban(id,enabled){const r=await db.auth.admin.updateUserById(id,{ban_duration:enabled?'876000h':'none'});if(r.error)throw r.error;},
    async prepareDelete(op){const r=await db.rpc('account_prepare_delete',{p_id:op.id,p_lease:op.lease_token});if(r.error)throw new Error('Account preparation unavailable');return r.data;},
    async removeAvatar(path){const r=await db.storage.from('avatars').remove([path]);if(r.error)throw r.error;},
    async cleanupMedia(){
      const probe=await db.from('audio_media_cleanup').select('id').limit(1);
      if(probe.error)throw new Error('Media cleanup unavailable');
      return !probe.data?.length||await drainMediaCleanup(undefined,Math.min(deadline,Date.now()+10000));
    },
    async deleteAuth(id){const r=await db.auth.admin.deleteUser(id,false);if(r.error)throw r.error;},
    async finish(op,outcome,error){const r=await db.rpc('account_finish_operation',{p_id:op.id,p_lease:op.lease_token,p_outcome:outcome,p_error:error});if(r.error)throw new Error('Account acknowledgement unavailable');},
  };
  for(const operation of operations.slice(0,1)) {
    if(Date.now()>=deadline)break;
    if(operation.status!=='running'||!operation.lease_token)continue;
    await processAccountOperation(operation,transport,process.env.NEXT_PUBLIC_APP_URL??'http://localhost:3000');
  }
}
