import { beforeEach,expect,it,vi } from 'vitest';
const state=vi.hoisted(()=>({user:{id:'user'} as {id:string}|null,calls:[] as {name:string,args:unknown}[],error:null as {code:string;message:string}|null}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({auth:{getUser:async()=>({data:{user:state.user}})},rpc:async(name:string,args:unknown)=>{state.calls.push({name,args});return {data:{ok:true},error:state.error};}})}));
import { POST as submit } from '@/app/api/employee/setup/route';
import { POST as membership, GET as members } from '@/app/api/admin/members/route';
import { PATCH as edit } from '@/app/api/admin/employees/route';
import { POST as department } from '@/app/api/admin/departments/route';
const id='00000000-0000-4000-8000-000000000001';
const request=(body:unknown)=>new Request('https://app.test',{method:'POST',body:JSON.stringify(body)});
beforeEach(()=>{state.user={id};state.calls=[];state.error=null;});
it('requires authentication and validates setup before calling the database',async()=>{
  state.user=null;expect((await submit(request({}))).status).toBe(401);state.user={id};
  expect((await submit(request({userId:id,departmentId:id,jobTitle:'Engineer'}))).status).toBe(400);
  expect(state.calls).toHaveLength(0);
  expect((await submit(request({userId:id,departmentId:id,jobTitle:'Engineer',managerId:null}))).status).toBe(200);
  expect(state.calls[0]).toEqual({name:'employee_submit',args:{p_department:id,p_title:'Engineer',p_manager:null}});
});
it('uses database authorization for admin operations and exposes a protected member list',async()=>{
  await members();expect(state.calls[0].name).toBe('employee_admin_list');
  state.error={code:'42501',message:'Owner required'};
  expect((await membership(request({userId:id,enabled:true}))).status).toBe(403);
  expect((await edit(request({userId:id,departmentId:id,jobTitle:'Lead',managerId:null}))).status).toBe(403);
});
it('does not leak unexpected database errors and reports conflicts usefully',async()=>{
  state.error={code:'XX000',message:'private internals'};
  const r=await submit(request({userId:id,departmentId:id,jobTitle:'Engineer',managerId:null}));
  expect(r.status).toBe(500);expect(await r.text()).not.toContain('private internals');
  state.error={code:'23505',message:'Employee setup already completed'};
  expect((await submit(request({userId:id,departmentId:id,jobTitle:'Engineer',managerId:null}))).status).toBe(409);
});
it('rejects a stale setup form after the authenticated account changes',async()=>{
  state.user={id:'00000000-0000-4000-8000-000000000002'};
  const response=await submit(request({userId:id,departmentId:id,jobTitle:'Engineer',managerId:null}));
  expect(response.status).toBe(409);
  expect(await response.text()).toContain('account has changed');
  expect(state.calls).toHaveLength(0);
});
it('explains duplicate departments without exposing constraint text',async()=>{
  state.error={code:'23505',message:'duplicate key value violates unique constraint "employee_department_name"'};
  const response=await department(request({id:null,name:'IT',archived:false}));
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({error:'A department with this name already exists.'});
});
