import {beforeEach,expect,it,vi} from 'vitest';
import {jwtVerify} from 'jose';
const state=vi.hoisted(()=>({user:'00000000-0000-4000-8000-000000000001',rpc:vi.fn(),cleanup:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({auth:{getUser:async()=>({data:{user:state.user?{id:state.user}:null}})},rpc:state.rpc})}));
vi.mock('@/lib/calls/cleanup',()=>({drainMediaCleanup:state.cleanup}));
import {GET,POST,PATCH} from '@/app/api/calls/route';
import {POST as TOKEN} from '@/app/api/calls/[callId]/token/route';
const id='00000000-0000-4000-8000-000000000009';
const room='helios-'+id;
const req=(body:unknown)=>new Request('https://app.test/api/calls',{method:'POST',body:JSON.stringify(body)});
beforeEach(()=>{
 state.user='00000000-0000-4000-8000-000000000001';state.rpc.mockReset();state.cleanup.mockReset().mockResolvedValue(true);
 vi.stubEnv('LIVEKIT_URL','wss://qa.livekit.cloud');vi.stubEnv('LIVEKIT_API_KEY','API-test-only');vi.stubEnv('LIVEKIT_API_SECRET','synthetic-secret-for-audio-tests-12345');
 vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY','synthetic-service-role');
 vi.stubEnv('AUDIO_CALLS_ENABLED','true');
});
it('requires authentication and validates all identifiers and commands before database writes',async()=>{
 state.user='';expect((await POST(req({conversationId:id}))).status).toBe(401);
 state.user=id;
 for(const body of [{conversationId:'bad'},null])expect((await POST(req(body))).status).toBe(400);
 for(const body of [{callId:'bad',action:'join'},{callId:id,action:'invented'},{callId:id,action:'kick',targetId:'bad'},{callId:id,action:'end',targetId:id}])expect((await PATCH(req(body))).status).toBe(400);
 expect(state.rpc).not.toHaveBeenCalled();
});
it('maps permission failures and conflicts while preserving server-only credentials',async()=>{
 state.rpc.mockResolvedValue({error:{code:'42501',message:'Forbidden'}});
 expect((await POST(req({conversationId:id}))).status).toBe(403);
 state.rpc.mockResolvedValue({error:{code:'23514',message:'Already in another call'}});
 expect((await PATCH(req({callId:id,action:'join'}))).status).toBe(409);
 vi.stubEnv('LIVEKIT_API_SECRET','');expect((await POST(req({conversationId:id}))).status).toBe(503);
});
it('returns authorized call history and starts/mutates calls using authenticated RPCs',async()=>{
 state.rpc.mockResolvedValue({data:[{id,state:'ended'}],error:null});
 expect((await (await GET(new Request('https://app.test/api/calls?conversationId='+id))).json()).calls).toHaveLength(1);
 state.rpc.mockResolvedValue({data:{id,state:'ringing'},error:null});
 expect((await (await POST(req({conversationId:id}))).json()).call.state).toBe('ringing');
 expect((await PATCH(req({callId:id,action:'join'}))).status).toBe(200);
});
it('mints a short-lived microphone-only room token using exclusively server-authorized room and identity',async()=>{
 state.rpc.mockResolvedValue({data:{room,identity:state.user},error:null});
 const response=await TOKEN(req({room:'attacker',identity:'attacker'}),{params:Promise.resolve({callId:id})});
 expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toContain('no-store');
 const result=await response.json();const {payload}=await jwtVerify(result.token,new TextEncoder().encode('synthetic-secret-for-audio-tests-12345'));
 expect(payload.sub).toBe(state.user);expect(payload.iss).toBe('API-test-only');
 expect(payload.video).toMatchObject({room,roomJoin:true,canPublish:true,canSubscribe:true,canPublishData:false,canPublishSources:['microphone']});
 expect((payload.video as Record<string,unknown>).roomAdmin).toBeUndefined();
 expect(payload.exp!-payload.nbf!).toBeLessThanOrEqual(120);
 expect(JSON.stringify(result)).not.toContain('synthetic-secret');
});
it('denies tokens before authorization and rechecks after signing to catch concurrent removal',async()=>{
 state.rpc.mockResolvedValue({error:{code:'42501',message:'Forbidden'}});
 const context={params:Promise.resolve({callId:id})};
 expect((await TOKEN(req({}),context)).status).toBe(403);
 state.rpc.mockReset().mockResolvedValueOnce({data:{room,identity:state.user},error:null}).mockResolvedValueOnce({error:{code:'42501',message:'Removed'}});
 expect((await TOKEN(req({}),context)).status).toBe(403);
});
it('fails closed on pending media cleanup before issuing another token',async()=>{
 state.cleanup.mockResolvedValue(false);state.rpc.mockResolvedValue({data:{room,identity:state.user},error:null});
 expect((await TOKEN(req({}),{params:Promise.resolve({callId:id})})).status).toBe(503);
});
it('keeps calling disabled while background maintenance is being verified',async()=>{
 vi.stubEnv('AUDIO_CALLS_ENABLED','false');state.rpc.mockResolvedValue({data:[],error:null});
 expect((await POST(req({conversationId:id}))).status).toBe(503);
 expect((await (await GET(new Request('https://app.test/api/calls'))).json()).ready).toBe(false);
 expect((await TOKEN(req({}),{params:Promise.resolve({callId:id})})).status).toBe(503);
});
it('keeps group media gated until the direct-call release is verified',async()=>{
 vi.stubEnv('GROUP_AUDIO_ENABLED','false');state.rpc.mockResolvedValue({data:{room,identity:state.user,kind:'group'},error:null});
 expect((await TOKEN(req({}),{params:Promise.resolve({callId:id})})).status).toBe(503);
});
