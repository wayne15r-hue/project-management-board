import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn(),ban:vi.fn(),drain:vi.fn()}));
vi.mock('@supabase/supabase-js',()=>({createClient:()=>({rpc:m.rpc,auth:{admin:{updateUserById:m.ban}}})}));
vi.mock('@/lib/calls/cleanup',()=>({drainMediaCleanup:m.drain}));
import {runAccountMaintenance} from '@/lib/accounts/worker';
const operation={id:'op',target_id:'target',action:'deactivate',status:'running',lease_token:'lease'};
beforeEach(()=>{vi.clearAllMocks();m.ban.mockResolvedValue({error:null});m.drain.mockResolvedValue(false);});
it('ignores unrelated failed call cleanup when this account has no pending disconnections',async()=>{
 m.rpc.mockImplementation(async(name:string)=>({data:name==='account_claim_operations'?[operation]:name==='account_media_pending'?false:true,error:null}));
 await runAccountMaintenance();
 expect(m.drain).not.toHaveBeenCalled();
 expect(m.rpc).toHaveBeenCalledWith('account_finish_operation',expect.objectContaining({p_outcome:'succeeded'}));
});
it('rechecks target readiness even when the global drain reports an unrelated failure',async()=>{
 let probes=0;
 m.rpc.mockImplementation(async(name:string)=>({data:name==='account_claim_operations'?[operation]:name==='account_media_pending'?++probes===1:true,error:null}));
 await runAccountMaintenance();
 expect(m.drain).toHaveBeenCalledOnce();
 expect(m.rpc).toHaveBeenCalledWith('account_finish_operation',expect.objectContaining({p_outcome:'succeeded'}));
});
