import {beforeEach,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({getUser:vi.fn(),rpc:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({auth:{getUser:mock.getUser},rpc:mock.rpc})}));
import {POST} from '@/app/api/profile/name/route';
import {PATCH} from '@/app/api/admin/employees/[userId]/name/route';
const req=(body:unknown)=>new Request('https://app.test/api/profile/name',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
beforeEach(()=>{mock.getUser.mockResolvedValue({data:{user:{id:'u'}}});mock.rpc.mockReset().mockResolvedValue({data:{full_name:'李'},error:null});});
it('requires authentication and validates names before calling the database',async()=>{
 mock.getUser.mockResolvedValueOnce({data:{user:null}});expect((await POST(req({firstName:'Alex'}))).status).toBe(401);
 expect((await POST(req({firstName:'  '}))).status).toBe(400);expect((await POST(req({firstName:'bad\nname'}))).status).toBe(400);expect(mock.rpc).not.toHaveBeenCalled();
});
it('supports single Unicode names and maps concurrent setup to conflict',async()=>{
 expect((await POST(req({firstName:'李'}))).status).toBe(200);expect(mock.rpc).toHaveBeenCalledWith('profile_set_initial_name',{p_first:'李',p_last:null});
 mock.rpc.mockResolvedValueOnce({error:{code:'23505',message:'Name already set'}});expect((await POST(req({firstName:'Other'}))).status).toBe(409);
});
it('rejects a stale name form submitted after an account change',async()=>{
 const response=await POST(req({firstName:'Alex',userId:'00000000-0000-4000-8000-000000000002'}));expect(response.status).toBe(409);expect((await response.json()).code).toBe('ACCOUNT_CHANGED');expect(mock.rpc).not.toHaveBeenCalled();
});
it('delegates administrator permission to the database and denies unauthorized corrections',async()=>{
 mock.rpc.mockResolvedValueOnce({error:{code:'42501',message:'Admin required'}});
 const context={params:Promise.resolve({userId:'00000000-0000-4000-8000-000000000002'})};expect((await PATCH(req({firstName:'Alex'}),context)).status).toBe(403);
});
