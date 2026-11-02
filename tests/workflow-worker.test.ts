import { afterEach,beforeEach,expect,it,vi } from 'vitest';
const s=vi.hoisted(()=>({calls:[] as Array<{name:string;args:Record<string,unknown>|undefined}>,jobs:[] as unknown[],send:vi.fn(),busy:false}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({rpc:async(name:string,args?:Record<string,unknown>)=>{s.calls.push({name,args});return {data:name==='workflow_claim_deliveries'?s.jobs:name==='workflow_validate_lease'?true:name==='workflow_begin_maintenance'?!s.busy:null,error:null};}})}));
vi.mock('resend',()=>({Resend:class{emails={send:s.send};}}));
import { runWorkflowMaintenance } from '@/lib/workflows/maintenance';
beforeEach(()=>{s.calls=[];s.jobs=[];s.busy=false;s.send.mockReset();vi.stubEnv('RESEND_FROM','sender@example.test');vi.stubEnv('RESEND_API_KEY','test-only');});
afterEach(()=>{vi.unstubAllEnvs();vi.useRealTimers();});
const job={id:'d',lease_token:'lease',payload:{from:'sender@example.test',to:'member@example.test',subject:'Task',text:'Body'},provider_key:'workflow-d'};
it('generates before claiming bounded deliveries and disables unconfigured transport',async()=>{
 vi.stubEnv('RESEND_FROM','');await runWorkflowMaintenance();expect(s.calls.map(x=>x.name)).toEqual(['workflow_begin_maintenance','workflow_generate','workflow_claim_deliveries']);expect(s.calls[2].args?.p_email_enabled).toBe(false);
});
it('does no generation or delivery while the global rate lease is busy',async()=>{s.busy=true;await runWorkflowMaintenance();expect(s.calls.map(x=>x.name)).toEqual(['workflow_begin_maintenance']);expect(s.send).not.toHaveBeenCalled();});
it('sends the frozen payload and stable key and records acceptance separately',async()=>{
 s.jobs=[job];s.send.mockResolvedValue({data:{id:'provider-id'},error:null});await runWorkflowMaintenance();
 expect(s.send).toHaveBeenCalledWith(job.payload,{idempotencyKey:job.provider_key});expect(s.calls.at(-1)?.args).toMatchObject({p_outcome:'accepted',p_provider_id:'provider-id'});
});
it('records transient and permanent failures without provider content',async()=>{
 s.jobs=[job];s.send.mockResolvedValue({data:null,error:{statusCode:429,name:'rate_limit_exceeded',message:'Sensitive recipient'}});await runWorkflowMaintenance();
 expect(s.calls.at(-1)?.args?.p_outcome).toBe('transient');expect(JSON.stringify(s.calls)).not.toContain('Sensitive');
 s.send.mockResolvedValue({data:null,error:{statusCode:422,name:'validation_error'}});await runWorkflowMaintenance();expect(s.calls.at(-1)?.args?.p_outcome).toBe('permanent');
});
it('bounds a stalled provider request and treats its outcome as ambiguous',async()=>{
 vi.useFakeTimers();s.jobs=[job];s.send.mockImplementation(()=>new Promise(()=>{}));const pending=runWorkflowMaintenance();await vi.advanceTimersByTimeAsync(3001);await pending;
 expect(s.calls.at(-1)?.args?.p_outcome).toBe('ambiguous');
});
