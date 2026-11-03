// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EmployeeAdmin } from '@/components/employee/employee-admin';
import type { AccountOperation, AccountPerson, DeletionPreview } from '@/types/accounts';

afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const person:AccountPerson={id:'worker',full_name:'Worker',email:'worker@example.com',record:null,department:null,manager:null,adminRole:null,account:{status:'active',createdAt:'2026-01-01T00:00:00Z',lastSignInAt:null,emailVerified:true,revision:7,formerAdmin:false},directory:{employeeId:null,workLocation:null,joiningDate:null,employmentType:null}};
const preview:DeletionPreview={userId:'worker',revision:8,status:'active',counts:{sharedBoards:1},requirements:[{key:'board:1',kind:'board',label:'Shared board ownership',count:1,candidates:[{id:'successor',full_name:'Successor',email:'successor@example.com'}],allowNone:false,blockedReason:null}],blockers:[],confirmationEmail:'auth-email@example.com'};
function mount({people=[person],role='admin',deletion=preview}:{people?:AccountPerson[];role?:'admin'|'owner';deletion?:DeletionPreview}={}) {
  const requests:{url:string;method:string;body:unknown}[]=[];
  vi.stubGlobal('fetch',vi.fn(async(input:string,init?:RequestInit)=>{
    const url=String(input),method=init?.method??'GET';
    const body=init?.body?JSON.parse(String(init.body)):null;requests.push({url,method,body});
    let data:unknown;
    if(url==='/api/employee/setup')data={userId:'me',role,record:null,departments:[{id:'it',name:'IT',archived:false}],manager:null};
    else if(url.startsWith('/api/admin/employees')&&method==='GET')data={items:people,total:people.length,page:1};
    else if(url==='/api/admin/members')data=[{id:'owner',full_name:'Owner',email:'owner@example.com',role:'owner'},{id:'admin',full_name:'Admin',email:'admin@example.com',role:'admin'}];
    else if(url.startsWith('/api/employee/managers'))data=[{id:'boss',full_name:'Boss',email:'boss@example.com'}];
    else if(url.endsWith('/deletion-preview'))data=deletion;
    else if(url.endsWith('/operations')&&method==='GET')data=people.find(p=>url.includes('/'+p.id+'/'))?.latestOperation??null;
    else if(url.startsWith('/api/admin/audit'))data={items:[{id:'audit',actor:'admin@example.com',target:'worker@example.com',action:'deactivate',outcome:'succeeded',createdAt:'2026-11-03T00:00:00Z'}],total:30,page:1};
    else data={id:'op',actor_id:'me',target_id:'worker',action:url.endsWith('reset-password')?'reset_password':'deactivate',status:'pending',payload:{},attempts:0,last_error:null,created_at:new Date().toISOString(),updated_at:new Date().toISOString()};
    return {ok:true,json:async()=>data};
  }));
  const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
  render(<QueryClientProvider client={client}><EmployeeAdmin/></QueryClientProvider>);
  return requests;
}
it('edits optional directory fields before user setup without completing mandatory details',async()=>{
  const requests=mount();
  fireEvent.click(await screen.findByRole('button',{name:'Edit directory'}));
  fireEvent.change(screen.getByLabelText('Employee ID (optional)'),{target:{value:'E-12'}});
  fireEvent.change(screen.getByLabelText('Employment joining date (optional)'),{target:{value:'2026-04-05'}});
  fireEvent.click(screen.getByRole('button',{name:'Save directory fields'}));
  await waitFor(()=>expect(requests.some(r=>r.url==='/api/admin/employees/worker/directory'&&r.method==='PATCH'&&JSON.stringify(r.body)===JSON.stringify({employeeId:'E-12',workLocation:null,joiningDate:'2026-04-05',employmentType:null}))).toBe(true));
  expect(requests.some(r=>r.url==='/api/admin/employees'&&r.method==='PATCH')).toBe(false);
});
it('shows Auth metadata and applies all directory filters on the server',async()=>{
  const requests=mount();await screen.findByText('worker@example.com');
  expect(screen.getByText(/Email verified/)).toBeTruthy();
  expect(screen.getByText(/Never signed in/)).toBeTruthy();
  for(const [label,value] of [['Department filter','it'],['Role filter','employee'],['Status filter','deactivated'],['Setup filter','incomplete']])fireEvent.change(screen.getByLabelText(label),{target:{value}});
  await screen.findByRole('option',{name:'Boss (boss@example.com)'});
  fireEvent.change(screen.getByLabelText('Manager filter'),{target:{value:'boss'}});
  await waitFor(()=>expect(requests.some(r=>r.url.includes('department=it')&&r.url.includes('role=employee')&&r.url.includes('status=deactivated')&&r.url.includes('setup=incomplete')&&r.url.includes('manager=boss'))).toBe(true));
});
it('submits reset with a UUID and reports queued acceptance without claiming delivery',async()=>{
  const requests=mount();fireEvent.click(await screen.findByRole('button',{name:'Send password reset email'}));
  await screen.findByText(/Queued/);
  const request=requests.find(r=>r.url.endsWith('/reset-password'))!;
  expect(request.method).toBe('POST');expect(request.body).toEqual({operationId:expect.stringMatching(/^[0-9a-f-]{36}$/)});
  expect(screen.queryByText(/email (sent|delivered)/i)).toBeNull();
});
it('uses current account revision for deactivation',async()=>{
  const requests=mount();fireEvent.click(await screen.findByRole('button',{name:'Deactivate account'}));
  fireEvent.click(screen.getByRole('button',{name:'Confirm deactivation'}));
  await waitFor(()=>expect(requests.find(r=>r.url.endsWith('/status'))?.body).toEqual({operationId:expect.stringMatching(/^[0-9a-f-]{36}$/),action:'deactivate',expectedRevision:7}));
});
it('protects self, owner and admin/former-admin accounts from ordinary admin destructive controls',async()=>{
  mount({people:[{...person,id:'me'},{...person,id:'owner',adminRole:'owner'},{...person,id:'admin',adminRole:'admin'},{...person,id:'former',account:{...person.account,formerAdmin:true}}]});
  await screen.findAllByText('worker@example.com');
  expect(screen.queryByRole('button',{name:'Deactivate account'})).toBeNull();
  expect(screen.queryByRole('button',{name:'Delete account'})).toBeNull();
  expect(screen.queryByRole('button',{name:'Grant admin access'})).toBeNull();
});
it('lets the owner resume deletion after the initiating admin loses authorization',async()=>{
 mount({role:'owner',people:[{...person,account:{...person.account,status:'deleting'},latestOperation:{id:'old',actor_id:'revoked-admin',target_id:'worker',action:'delete',status:'failed',payload:{},attempts:1,last_error:'Authorization or target changed',created_at:'2026-11-03T00:00:00Z',updated_at:'2026-11-03T00:00:00Z'}}]});
 fireEvent.click(await screen.findByRole('button',{name:'Resume deletion'}));
 await screen.findByRole('region',{name:'Delete account review'});
 expect(screen.queryByRole('button',{name:'Retry cleanup'})).toBeNull();
});
it('requires eligible transfers and the exact Auth email before deleting with preview revision',async()=>{
  const requests=mount();fireEvent.click(await screen.findByRole('button',{name:'Delete account'}));
  const wizard=await screen.findByRole('region',{name:'Delete account review'});
  const submit=within(wizard).getByRole('button',{name:'Permanently delete account'});
  expect(submit.hasAttribute('disabled')).toBe(true);
  fireEvent.change(within(wizard).getByLabelText('Transfer Shared board ownership'),{target:{value:'successor'}});
  fireEvent.change(within(wizard).getByLabelText('Type the Auth email to confirm'),{target:{value:'worker@example.com'}});
  expect(submit.hasAttribute('disabled')).toBe(true);
  fireEvent.change(within(wizard).getByLabelText('Type the Auth email to confirm'),{target:{value:'auth-email@example.com'}});
  fireEvent.click(submit);
  await waitFor(()=>expect(requests.find(r=>r.url.endsWith('/delete'))?.body).toEqual({operationId:expect.stringMatching(/^[0-9a-f-]{36}$/),expectedRevision:8,confirmationEmail:'auth-email@example.com',transfers:{'board:1':'successor'}}));
});
it('keeps deletion blocked when the server reports no eligible successor',async()=>{
  mount({deletion:{...preview,blockers:['No eligible successor'],requirements:[{...preview.requirements[0],candidates:[],blockedReason:'No eligible successor'}]}});
  fireEvent.click(await screen.findByRole('button',{name:'Delete account'}));
  const wizard=await screen.findByRole('region',{name:'Delete account review'});
  fireEvent.change(within(wizard).getByLabelText('Type the Auth email to confirm'),{target:{value:'auth-email@example.com'}});
  expect(within(wizard).getByRole('button',{name:'Permanently delete account'}).hasAttribute('disabled')).toBe(true);
  expect(within(wizard).getAllByText('No eligible successor').length).toBeGreaterThan(0);
});
it('searches and paginates audit records without loading private work',async()=>{
  const requests=mount();fireEvent.click(await screen.findByRole('button',{name:'Audit log'}));
  await screen.findByText('deactivate');
  fireEvent.change(screen.getByLabelText('Search audit log'),{target:{value:'worker'}});
  await waitFor(()=>expect(requests.some(r=>r.url.includes('/api/admin/audit?q=worker&page=1'))).toBe(true));
  await waitFor(()=>expect(screen.getByRole('button',{name:'Next audit page'}).hasAttribute('disabled')).toBe(false));
  fireEvent.click(screen.getByRole('button',{name:'Next audit page'}));
  await waitFor(()=>expect(requests.some(r=>r.url.includes('/api/admin/audit?q=worker&page=2'))).toBe(true));
});
const failed:AccountOperation={id:'old-op',actor_id:'me',target_id:'worker',action:'deactivate',status:'failed',payload:{expectedRevision:6},attempts:2,last_error:'Provider unavailable',created_at:'2026-11-03T00:00:00Z',updated_at:'2026-11-03T00:01:00Z'};
it('retries only the initiating actor’s failed cleanup using the original operation UUID',async()=>{
  const requests=mount({people:[{...person,account:{...person.account,status:'deactivated'},latestOperation:failed}]});
  fireEvent.click(await screen.findByRole('button',{name:'Retry cleanup'}));
  await waitFor(()=>expect(requests.find(r=>r.url.endsWith('/operations')&&r.method==='POST')?.body).toEqual({operationId:'old-op'}));
  expect(requests.some(r=>r.url.endsWith('/status')&&r.method==='PATCH')).toBe(false);
});
it.each([{...failed,actor_id:'someone-else'},{...failed,action:'reset_password' as const},{...failed,status:'ambiguous' as const}])('does not offer cleanup replay for unauthorized or uncertain operations: %j',async latestOperation=>{
  mount({people:[{...person,latestOperation}]});
  await screen.findByText(/Latest action/);
  expect(screen.queryByRole('button',{name:'Retry cleanup'})).toBeNull();
});
it('does not allow immediate new reset after an ambiguous recent request',async()=>{
  mount({people:[{...person,latestOperation:{...failed,action:'reset_password',status:'ambiguous',created_at:new Date().toISOString()}}]});
  await screen.findByText(/Outcome uncertain/);
  expect(screen.getByRole('button',{name:'Send password reset email'}).hasAttribute('disabled')).toBe(true);
});
it('lets the owner manage current and former admins while preserving owner and self protections',async()=>{
  mount({role:'owner',people:[{...person,id:'me'},{...person,id:'owner',adminRole:'owner'},{...person,id:'admin',adminRole:'admin'},{...person,id:'former',account:{...person.account,formerAdmin:true}}]});
  await screen.findAllByText('worker@example.com');
  expect(screen.getAllByRole('button',{name:'Deactivate account'})).toHaveLength(2);
  expect(screen.getAllByRole('button',{name:'Delete account'})).toHaveLength(2);
});
