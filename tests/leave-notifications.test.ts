import {beforeEach,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({calls:[] as unknown[],user:{id:'user'} as {id:string}|null,error:null as null|{code:string;message:string}}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({auth:{getUser:async()=>({data:{user:state.user}})},rpc:async(name:string,args:unknown)=>{state.calls.push({name,args});return {data:null,error:state.error};}})}));
import {POST} from '@/app/api/notifications/[id]/read/route';
import {POST as all} from '@/app/api/notifications/read-all/route';
const id='b0000000-0000-4000-8000-000000000001';
const read=(v:string)=>POST(new Request('https://app.test',{method:'POST'}),{params:Promise.resolve({id:v})});
beforeEach(()=>{state.calls=[];state.user={id:'user'};state.error=null;});
it('marks leave messages through the current-permission RPC',async()=>{
 expect((await read(`leave:${id}`)).status).toBe(200);expect(state.calls).toEqual([{name:'leave_mark_notifications_read',args:{p_id:id}}]);
});
it('rejects malformed leave notification ids',async()=>{expect((await read('leave:bad')).status).toBe(400);expect(state.calls).toEqual([]);});
it('includes leave messages when marking all read',async()=>{expect((await all()).status).toBe(200);expect(state.calls).toContainEqual({name:'leave_mark_notifications_read',args:{p_id:null}});});
