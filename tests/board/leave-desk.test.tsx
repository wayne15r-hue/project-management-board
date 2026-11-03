// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RequestForm } from '@/components/leave-desk/request-form';
import { LeaveSettings } from '@/components/leave-desk/settings';
import { LeaveCalendarView } from '@/components/leave-desk/calendar';
import { LeaveRequestDetail } from '@/components/leave-desk/request-detail';
import { useLeaveMutation } from '@/components/leave-desk/shared';
import type { LeaveContext } from '@/types/leave-desk';
vi.mock('@/lib/supabase/client',()=>({createClient:()=>({auth:{onAuthStateChange:()=>({data:{subscription:{unsubscribe:()=>{}}}})}})}));
const context:LeaveContext={userId:'u',admin:true,manager:false,employees:[{id:'u',name:'Employee',department_id:'d'},{id:'other',name:'Colleague',department_id:'d'}],departments:[{id:'d',name:'Operations'}],types:[{id:'sick',name:'Medical leave',enabled:true}],policies:[{id:'policy',name:'Explicit policy',year_start:4,allowances:[{type_id:'sick',days:5,paid:true,tracked:true}]}],calendars:[{id:'cal',name:'Office',timezone:'Asia/Kolkata',weekdays:[1,2,3,4,5]}],assignment:{user_id:'u',policy_id:'policy',calendar_id:'cal'}};
const clients:QueryClient[]=[];
function show(children:React.ReactNode){const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});clients.push(client);return render(<QueryClientProvider client={client}>{children}</QueryClientProvider>);}
beforeEach(()=>{vi.stubGlobal('crypto',webcrypto);sessionStorage.clear();});
afterEach(()=>{cleanup();clients.splice(0).forEach(c=>c.clear());vi.unstubAllGlobals();});
it('requires admin setup and does not fabricate an allowance',()=>{show(<RequestForm userId="u" context={{...context,assignment:null}} onSaved={vi.fn()} onClose={vi.fn()}/>);expect(screen.getByText(/Setup needed/)).toBeTruthy();expect(screen.queryByRole('button',{name:'Submit request'})).toBeNull();});
it('sends a half day with a past-date explanation, retains failed draft and reuses retry key',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:false,json:async()=>({error:'Insufficient balance'})})));
 show(<RequestForm userId="u" context={context} onSaved={vi.fn()} onClose={vi.fn()}/>);
 fireEvent.change(screen.getByLabelText('Leave type'),{target:{value:'sick'}});for(const name of ['Start date','End date'])fireEvent.change(screen.getByLabelText(name),{target:{value:'2020-01-02'}});
 fireEvent.change(screen.getByLabelText('Duration'),{target:{value:'second'}});fireEvent.change(screen.getByLabelText('Reason (private)'),{target:{value:'Appointment'}});fireEvent.change(screen.getByLabelText('Past-date explanation'),{target:{value:'Retrospective correction'}});
 fireEvent.click(screen.getByRole('button',{name:'Submit request'}));await screen.findByText('Insufficient balance');expect((screen.getByLabelText('Reason (private)') as HTMLTextAreaElement).value).toBe('Appointment');
 const first=JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));expect(first).toMatchObject({half:'second',past_explanation:'Retrospective correction',start_date:'2020-01-02'});
 fireEvent.click(screen.getByRole('button',{name:'Submit request'}));await waitFor(()=>expect(fetch).toHaveBeenCalledTimes(2));expect(JSON.parse(String(vi.mocked(fetch).mock.calls[1][1]?.body)).key).toBe(first.key);
});
it('admin policy editing preserves explicit paid and tracked allowances',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({id:'policy'})})));show(<LeaveSettings userId="u" context={context}/>);
 fireEvent.change(screen.getByLabelText('Configure'),{target:{value:'policy'}});fireEvent.change(screen.getByLabelText('Create or edit'),{target:{value:'policy'}});
 expect((screen.getByLabelText('Paid') as HTMLInputElement).checked).toBe(true);expect((screen.getByLabelText('Tracks a balance') as HTMLInputElement).checked).toBe(true);
 fireEvent.change(screen.getByLabelText('Medical leave allowance (days)'),{target:{value:'7.5'}});fireEvent.click(screen.getByRole('button',{name:'Save settings'}));await screen.findByText('Settings saved.');
 expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))).toMatchObject({kind:'policy',payload:{id:'policy',year_start:4,allowances:[{type_id:'sick',days:7.5,paid:true,tracked:true}]}});
});
it('calendar requests bounded month/week ranges and department filters while keeping coworker events anonymous',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({events:[{id:'private',user_id:'other',name:'Colleague',start_date:'2000-01-01',end_date:'2100-01-01',status:'approved',label:'On leave'}],holidays:[],warnings:[]})})));show(<LeaveCalendarView userId="u" context={context}/>);
 await screen.findAllByText('Colleague · On leave');expect(screen.queryByRole('link')).toBeNull();fireEvent.change(screen.getByLabelText('Calendar view'),{target:{value:'week'}});fireEvent.change(screen.getByLabelText('Department'),{target:{value:'d'}});
 await waitFor(()=>expect(vi.mocked(fetch).mock.calls.some(([url])=>String(url).includes('department=d'))).toBe(true));const call=vi.mocked(fetch).mock.calls.at(-1)!;const params=new URL(String(call[0]),'https://example.com').searchParams;expect((Date.parse(params.get('end')!)-Date.parse(params.get('start')!))/86400000).toBe(6);
 fireEvent.change(screen.getByLabelText('Show leave'),{target:{value:'personal'}});expect(screen.queryByText('Colleague · On leave')).toBeNull();
});
it('personal calendar ignores a previously selected other department and loads the employee’s own leave',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url)=>{const personal=!new URL(String(url),'https://example.com').searchParams.has('department');return {ok:true,json:async()=>({events:personal?[{id:'mine',user_id:'u',name:'Employee',start_date:'2000-01-01',end_date:'2100-01-01',status:'approved',label:'On leave'}]:[],holidays:[],warnings:[]})};}));
 show(<LeaveCalendarView userId="u" context={{...context,departments:[...context.departments,{id:'other-department',name:'Technology'}]}}/>);
 fireEvent.change(screen.getByLabelText('Department'),{target:{value:'other-department'}});await waitFor(()=>expect(vi.mocked(fetch).mock.calls.some(([url])=>String(url).includes('department=other-department'))).toBe(true));
 fireEvent.change(screen.getByLabelText('Show leave'),{target:{value:'personal'}});await screen.findAllByRole('link',{name:'On leave · Approved'});const last=vi.mocked(fetch).mock.calls.at(-1)!;expect(new URL(String(last[0]),'https://example.com').searchParams.has('department')).toBe(false);expect((screen.getByLabelText('Department') as HTMLSelectElement).disabled).toBe(true);
});
it('owner cannot approve their own request and cancellation retains the approved booking pending review',async()=>{
 const request={id:'req',user_id:'u',reviewer_id:'u',type_id:'sick',start_date:'2026-12-01',end_date:'2026-12-01',half:'full',status:'approved',revision:3,reason:'Private reason',created_at:'2026-11-01T00:00:00Z'};
 vi.stubGlobal('fetch',vi.fn(async(url,init)=>({ok:true,json:async()=>init?.method?request:String(url).endsWith('/context')?context:{request,days:[],files:[],comments:[],history:[]}})));show(<LeaveRequestDetail userId="u" id="req"/>);
 await screen.findByText('Private reason');expect(screen.queryByRole('option',{name:'Approve'})).toBeNull();fireEvent.change(screen.getByLabelText('Action'),{target:{value:'cancel'}});expect(screen.getByText(/booking remains effective/)).toBeTruthy();fireEvent.change(screen.getByLabelText('Comment / decision reason'),{target:{value:'Plans changed'}});fireEvent.click(screen.getByRole('button',{name:'Save response'}));
 await waitFor(()=>expect(vi.mocked(fetch).mock.calls.some(([,init])=>init?.method==='POST')).toBe(true));const call=vi.mocked(fetch).mock.calls.find(([,init])=>init?.method==='POST')!;expect(JSON.parse(String(call[1]?.body))).toMatchObject({revision:3,action:'cancel',payload:{reason:'Plans changed'}});
});
it('independent admin can review a managerless request and sees dated reasons and authorized task warnings',async()=>{
 const request={id:'req',user_id:'other',reviewer_id:null,can_review:true,type_id:'sick',start_date:'2026-12-01',end_date:'2026-12-01',half:'full',status:'pending',revision:3,reason:'Private reason',created_at:'2026-11-01T00:00:00Z'};
 vi.stubGlobal('fetch',vi.fn(async(url)=>({ok:true,json:async()=>String(url).endsWith('/context')?context:{request,days:[],files:[],comments:[],history:[{id:'h',action:'changes',payload:{reason:'Please add handover notes'},created_at:'2026-11-01T10:00:00Z'}],task_warnings:[{id:'task',board_id:'board',title:'Review forecast',due_date:'2026-12-01T10:00:00Z'}]}})));
 show(<LeaveRequestDetail userId="u" id="req"/>);await screen.findByText('Private reason');expect(screen.getByRole('option',{name:'Approve'})).toBeTruthy();expect(screen.getByText('Please add handover notes')).toBeTruthy();expect(screen.getByRole('link',{name:'Review forecast'}).getAttribute('href')).toBe('/dashboard/board/board?card=task');expect(screen.getByLabelText('Attach PDF, JPEG or PNG (10 MB maximum)')).toBeTruthy();
});
it('reuses an unresolved adjustment UUID after remount without persisting private reasons',async()=>{
 const body={kind:'adjustment',payload:{user_id:'other',type_id:'sick',period_start:'2026-04-01',days:1,reason:'Private documented correction'}};
 function Adjustment(){const mutation=useLeaveMutation('u','settings');return <><button onClick={()=>mutation.mutate(body)}>Adjust</button>{mutation.error&&<p role="alert">{mutation.error.message}</p>}{mutation.isSuccess&&<p>Saved</p>}</>;}
 vi.stubGlobal('fetch',vi.fn().mockRejectedValueOnce(new Error('Connection lost')).mockResolvedValue({ok:true,json:async()=>({id:'ledger'})}));
 const first=show(<Adjustment/>);fireEvent.click(screen.getByRole('button',{name:'Adjust'}));await screen.findByRole('alert');const key=JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body)).key;
 expect(JSON.stringify(sessionStorage)).not.toContain('Private documented correction');first.unmount();show(<Adjustment/>);fireEvent.click(screen.getByRole('button',{name:'Adjust'}));await screen.findByText('Saved');expect(JSON.parse(String(vi.mocked(fetch).mock.calls[1][1]?.body)).key).toBe(key);expect(sessionStorage.length).toBe(0);
});
it('corrects an existing holiday using its stable identity and prefilled source metadata',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({id:'holiday'})})));show(<LeaveSettings userId="u" context={{...context,holidays:[{id:'holiday',calendar_id:'cal',name:'Company holiday',date:'2026-11-10',kind:'company',source:'Company notice',review_status:'reviewed'}]}}/>);
 fireEvent.change(screen.getByLabelText('Configure'),{target:{value:'holiday'}});fireEvent.change(screen.getByLabelText('Create or edit'),{target:{value:'holiday'}});expect((screen.getByLabelText('Source / source URL') as HTMLInputElement).value).toBe('Company notice');fireEvent.change(screen.getByLabelText('Date'),{target:{value:'2026-11-11'}});fireEvent.click(screen.getByRole('button',{name:'Save settings'}));await screen.findByText('Settings saved.');expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))).toMatchObject({kind:'holiday',payload:{id:'holiday',date:'2026-11-11',calendar_id:'cal',kind:'company',source:'Company notice',review_status:'reviewed'}});
});
