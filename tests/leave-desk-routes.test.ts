import { beforeEach, expect, it, vi } from 'vitest';
const state=vi.hoisted(()=>({user:{id:'user'} as {id:string}|null,calls:[] as unknown[],error:null as null|{code:string;message:string}}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({auth:{getUser:async()=>({data:{user:state.user}})},rpc:async(name:string,args:unknown)=>{state.calls.push({name,args});return {data:{id:'request'},error:state.error};}})}));
import { POST as submit, GET as list } from '@/app/api/leave-desk/requests/route';
import { POST as action } from '@/app/api/leave-desk/requests/[id]/actions/route';
import { GET as calendar } from '@/app/api/leave-desk/calendar/route';
import { POST as settings } from '@/app/api/leave-desk/settings/route';
const id='b0000000-0000-4000-8000-000000000001',key='c0000000-0000-4000-8000-000000000001';
const body={type_id:id,start_date:'2026-12-01',end_date:'2026-12-02',half:'full',reason:'Personal',key};
const req=(data:unknown)=>new Request('https://app.test',{method:'POST',body:JSON.stringify(data)});
const params={params:Promise.resolve({id})};
beforeEach(()=>{state.user={id:'user'};state.calls=[];state.error=null;});
it('requires authentication before submission and calendar access',async()=>{
 state.user=null;expect((await submit(req(body))).status).toBe(401);expect((await calendar(new Request('https://app.test?start=2026-12-01&end=2026-12-02'))).status).toBe(401);expect(state.calls).toEqual([]);
});
it('validates real calendar dates, duration and identifiers before invoking SQL',async()=>{
 for(const bad of [{...body,start_date:'2026-02-30'},{...body,half:'first'},{...body,key:'bad'},{...body,end_date:'2026-11-30'}])expect((await submit(req(bad))).status).toBe(400);
 expect(state.calls).toEqual([]);
});
it('passes immutable submission and retry identity to the authenticated RPC',async()=>{
 expect((await submit(req(body))).status).toBe(201);
 expect(state.calls).toMatchObject([{name:'leave_submit',args:{p_key:key,p_payload:{type_id:id,start_date:'2026-12-01',end_date:'2026-12-02',half:'full',reason:'Personal'}}}]);
});
it('requires reasoned declines and rejects stale/unknown action shapes',async()=>{
 for(const bad of [{action:'decline',revision:1,key,payload:{}},{action:'takeover',revision:1,key,payload:{reason:''}},{action:'approve',revision:0,key},{action:'edit',revision:1,key}])expect((await action(req(bad),params)).status).toBe(400);
 expect(state.calls).toEqual([]);
});
it('delegates decisions with revision and idempotency key without trusting a client reviewer',async()=>{
 expect((await action(req({action:'approve',revision:3,key,payload:{}}),params)).status).toBe(200);
 expect(state.calls).toEqual([{name:'leave_action',args:{p_request:id,p_action:'approve',p_revision:3,p_payload:{},p_key:key}}]);
});
it('bounds calendar queries and rejects invalid views and non-company holidays without provenance',async()=>{
 expect((await calendar(new Request('https://app.test?start=2026-01-01&end=2027-01-01'))).status).toBe(400);
 expect((await list(new Request('https://app.test?view=everyone'))).status).toBe(400);
 expect((await settings(req({kind:'holiday',key,payload:{date:'2026-12-01',name:'Reference',kind:'india_central',review_status:'reviewed'}}))).status).toBe(400);
 expect(state.calls).toEqual([]);
});
it('preserves a holiday identity when correcting a company day off',async()=>{
 expect((await settings(req({kind:'holiday',key,payload:{id,calendar_id:id,date:'2026-12-01',name:'Corrected company holiday',kind:'company',source:'Company calendar',review_status:'reviewed'}}))).status).toBe(200);
 expect(state.calls).toMatchObject([{name:'leave_settings',args:{p_kind:'holiday',p_payload:{id,date:'2026-12-01'}}}]);
});
it.each([['42501',403],['40001',409],['23505',409],['22023',400],['XX000',500]])('maps SQLSTATE %s to %s and hides internal errors',async(code,status)=>{
 state.error={code,message:'sensitive internals'};const res=await submit(req(body));expect(res.status).toBe(status);if(status===500)expect(await res.text()).not.toContain('sensitive');
});
