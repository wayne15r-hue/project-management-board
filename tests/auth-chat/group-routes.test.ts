import { beforeEach, expect, it, vi } from 'vitest';
const state=vi.hoisted(()=>({rpc:vi.fn(), user:'00000000-0000-4000-8000-000000000001'}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({auth:{getUser:async()=>({data:{user:state.user?{id:state.user}:null}})},rpc:state.rpc})}));
import { POST } from '@/app/api/conversations/route';
const other='00000000-0000-4000-8000-000000000002';
const request=(body:unknown)=>new Request('https://app.test/api/conversations',{method:'POST',body:JSON.stringify(body)});
beforeEach(()=>{state.user='00000000-0000-4000-8000-000000000001';state.rpc.mockReset().mockResolvedValue({data:'new-group',error:null});});
it.each([null,'','  ','x'.repeat(101),123])('rejects invalid group name %s before creation',async name=>{
  expect((await POST(request({type:'group',name,userIds:[other]}))).status).toBe(400);
  expect(state.rpc).not.toHaveBeenCalled();
});
it.each([[],['bad'],[null],Array(50).fill(other)].map(userIds=>({userIds})))('rejects invalid member input before creation $userIds',async ({userIds})=>{
  expect((await POST(request({type:'group',name:'QA',userIds}))).status).toBe(400);
  expect(state.rpc).not.toHaveBeenCalled();
});
it('reads current group member roles through an authenticated RPC',async()=>{
  const {GET}=await import('@/app/api/conversations/[conversationId]/group/route');
  state.rpc.mockResolvedValue({data:{name:'QA',members:[{user_id:other,is_admin:true,profiles:{id:other,email:'qa@test'}}]},error:null});
  const response=await GET(new Request('https://app.test'),{params:Promise.resolve({conversationId:other})});
  expect(response.status).toBe(200);
  expect((await response.json()).members[0].is_admin).toBe(true);
});
it('validates mutation actions and maps authorization/last-admin failures',async()=>{
  const {PATCH}=await import('@/app/api/conversations/[conversationId]/group/route');
  const context={params:Promise.resolve({conversationId:other})};
  for(const body of [{action:'nope'},{action:'add',userId:'bad'},{action:'rename',name:''},{action:'leave',userId:other}]) expect((await PATCH(request(body),context)).status).toBe(400);
  state.rpc.mockResolvedValue({error:{code:'42501',message:'Only admins can manage groups'}});
  expect((await PATCH(request({action:'rename',name:'New'}),context)).status).toBe(403);
  state.rpc.mockResolvedValue({error:{code:'23514',message:'The last admin must promote another member first'}});
  expect((await PATCH(request({action:'leave'}),context)).status).toBe(409);
});
it('requires a signed-in user and valid conversation ID for group endpoints',async()=>{
  const {GET,PATCH}=await import('@/app/api/conversations/[conversationId]/group/route');
  const context={params:Promise.resolve({conversationId:other})};
  state.user='';
  expect((await GET(request({}),context)).status).toBe(401);
  expect((await PATCH(request({action:'leave'}),context)).status).toBe(401);
  state.user=other;
  expect((await GET(request({}),{params:Promise.resolve({conversationId:'bad'})})).status).toBe(400);
  expect(state.rpc).not.toHaveBeenCalled();
});
it('passes validated normalized group changes and reports nonexistent members as bad requests',async()=>{
  const {PATCH}=await import('@/app/api/conversations/[conversationId]/group/route');
  const context={params:Promise.resolve({conversationId:other})};
  expect((await PATCH(request({action:'rename',name:'  Changed  '}),context)).status).toBe(200);
  expect(state.rpc).toHaveBeenCalledWith('manage_group',{p_conversation_id:other,p_action:'rename',p_user_id:null,p_name:'Changed'});
  state.rpc.mockResolvedValue({error:{code:'22023',message:'Invalid member profile'}});
  expect((await PATCH(request({action:'add',userId:other}),context)).status).toBe(400);
});
it('returns a bad request for malformed JSON',async()=>{
  expect((await POST(new Request('https://app.test',{method:'POST',body:'{'}))).status).toBe(400);
});
it('creates a trimmed named two-person group and preserves direct payloads',async()=>{
  expect((await POST(request({type:'group',name:' QA two ',userIds:[other]}))).status).toBe(200);
  expect(state.rpc).toHaveBeenCalledWith('create_conversation',{p_type:'group',p_name:'QA two',p_member_ids:[other]});
  await POST(request({type:'direct',userIds:[other]}));
  expect(state.rpc).toHaveBeenLastCalledWith('create_conversation',{p_type:'direct',p_name:null,p_member_ids:[other]});
});
