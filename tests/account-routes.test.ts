import { beforeEach,expect,it,vi } from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn(),getUser:vi.fn(),run:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({auth:{getUser:m.getUser},rpc:m.rpc})}));
vi.mock('@/lib/accounts/worker',()=>({runAccountMaintenance:m.run}));
import {POST as reset} from '@/app/api/admin/accounts/[userId]/reset-password/route';
import {PATCH as status} from '@/app/api/admin/accounts/[userId]/status/route';
import {GET as directory} from '@/app/api/admin/employees/route';
const target='10000000-0000-4000-8000-000000000002',id='90000000-0000-4000-8000-000000000001';
const context={params:Promise.resolve({userId:target})};
const req=(body:unknown)=>new Request('https://app.test/api/admin/accounts/'+target,{method:'POST',body:JSON.stringify(body)});
beforeEach(()=>{vi.clearAllMocks();m.getUser.mockResolvedValue({data:{user:{id:'actor'}}});m.rpc.mockResolvedValue({data:{id},error:null});m.run.mockResolvedValue(undefined);});
it('binds resets to the authenticated RPC target and accepts no recipient override',async()=>{
 expect((await reset(req({operationId:id,email:'attacker@example.test'}),context)).status).toBe(400);
 expect(m.rpc).not.toHaveBeenCalled();
 expect((await reset(req({operationId:id}),context)).status).toBe(200);
 expect(m.rpc).toHaveBeenCalledWith('account_request_action',{p_target:target,p_action:'reset_password',p_operation:id,p_payload:{}});
});
it('rejects signed-out actors before worker execution',async()=>{
 m.getUser.mockResolvedValue({data:{user:null}});
 expect((await status(req({operationId:id,action:'deactivate',expectedRevision:1}),context)).status).toBe(401);
 expect(m.run).not.toHaveBeenCalled();
});
it('does not call providers when the database rejects a stale role or revision',async()=>{
 m.rpc.mockResolvedValue({data:null,error:{code:'42501',message:'Active admin required'}});
 expect((await status(req({operationId:id,action:'deactivate',expectedRevision:1}),context)).status).toBe(403);
 expect(m.run).not.toHaveBeenCalled();
});
it('passes bounded directory filters rather than interpolating profile searches',async()=>{
 await directory(new Request('https://app.test/api/admin/employees?role=admin&status=deactivated&setup=incomplete&page=2'));
 expect(m.rpc).toHaveBeenCalledWith('account_directory',{p_filters:expect.objectContaining({role:'admin',status:'deactivated',setup:'incomplete',page:2})});
});
