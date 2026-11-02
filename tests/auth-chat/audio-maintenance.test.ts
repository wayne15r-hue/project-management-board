import {beforeEach,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({rpc:vi.fn(),drain:vi.fn(),userRpc:vi.fn()}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({rpc:state.rpc})}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:'user'}}})},rpc:state.userRpc})}));
vi.mock('@/lib/calls/cleanup',()=>({drainMediaCleanup:state.drain}));
import {POST} from '@/app/api/calls/maintenance/route';
import {PATCH} from '@/app/api/conversations/[conversationId]/group/route';
import {DELETE} from '@/app/api/conversations/[conversationId]/route';
beforeEach(()=>{state.rpc.mockReset().mockResolvedValue({error:null});state.userRpc.mockReset().mockResolvedValue({error:null});state.drain.mockReset().mockResolvedValue(true);vi.stubEnv('LIVEKIT_URL','wss://qa.livekit.cloud');vi.stubEnv('LIVEKIT_API_KEY','test');vi.stubEnv('LIVEKIT_API_SECRET','test');vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY','test');});
it('runs fixed server maintenance without accepting arbitrary room targets or returning private metadata',async()=>{
 const response=await POST();expect(response.status).toBe(200);expect(await response.json()).toEqual({ok:true});
 expect(state.rpc).toHaveBeenCalledWith('audio_maintenance');
});
it('returns a generic retryable error and retains pending cleanup after failures',async()=>{
 state.drain.mockResolvedValue(false);expect((await POST()).status).toBe(503);
 state.rpc.mockResolvedValue({error:{message:'Private database failure'}});const response=await POST();expect(response.status).toBe(503);expect(await response.text()).not.toContain('Private database');
});
it('attempts immediate media disconnection after authorized group removal and conversation deletion',async()=>{
 const context={params:Promise.resolve({conversationId:'00000000-0000-4000-8000-000000000001'})};
 const response=await PATCH(new Request('https://app.test',{method:'PATCH',body:JSON.stringify({action:'remove',userId:'00000000-0000-4000-8000-000000000002'})}),context);
 expect(response.status).toBe(200);expect(state.drain).toHaveBeenCalledTimes(1);
 expect((await DELETE(new Request('https://app.test',{method:'DELETE'}),context)).status).toBe(200);expect(state.drain).toHaveBeenCalledTimes(2);
});
