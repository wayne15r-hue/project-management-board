// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
vi.mock('@/lib/supabase/client',()=>({createClient:()=>({auth:{onAuthStateChange:()=>({data:{subscription:{unsubscribe:()=>{}}}})}})}));
vi.mock('next/navigation',()=>({useRouter:()=>({push:vi.fn()})}));
import { ServiceDesk } from '@/components/service-desk/service-desk';
const team={id:'70000000-0000-4000-8000-000000000001',name:'Operations',support:true,admin:true,members:[]};
function show(){render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><ServiceDesk userId="u"/></QueryClientProvider>);}
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('explains team membership rather than presenting an unusable request form',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({teams:[],items:[],total:0,counts:{mine:0,queue:0,reviews:0,assigned:0}})})));
 show();expect(await screen.findByText(/Join or create a team/)).toBeTruthy();expect(screen.getByRole('link',{name:'Manage teams'})).toBeTruthy();
});
it('shows filtered counts and sends queue selection to the server',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url)=>({ok:true,json:async()=>String(url).endsWith('/teams')?{teams:[team]}:{items:[],total:0,pageSize:25,counts:{mine:2,queue:7,reviews:1,assigned:0}}})));
 show();const queue=await screen.findByRole('tab',{name:/Team Queue.*7/});fireEvent.click(queue);
 await waitFor(()=>expect(vi.mocked(fetch).mock.calls.some(c=>String(c[0]).includes('view=queue'))).toBe(true));
});
it('changes request fields by type and preserves a failed submission draft',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url,init)=>init?.method?{ok:false,json:async()=>({error:'Try again shortly'})}:{ok:true,json:async()=>String(url).endsWith('/teams')?{teams:[team]}:{items:[],total:0,pageSize:25,counts:{mine:0,queue:0,reviews:0,assigned:0}}}));
 show();fireEvent.click(await screen.findByRole('button',{name:'New request'}));
 fireEvent.change(screen.getByLabelText('Request type'),{target:{value:'purchase_request'}});
 expect(screen.getByLabelText('Cost')).toBeTruthy();
 fireEvent.change(screen.getByLabelText('Title'),{target:{value:'Design license'}});
 fireEvent.change(screen.getByLabelText('Description'),{target:{value:'For design work'}});
 fireEvent.change(screen.getByLabelText('Tool or equipment'),{target:{value:'Design app'}});
 fireEvent.change(screen.getByLabelText('Cost'),{target:{value:'100'}});
 fireEvent.change(screen.getByLabelText('Reason'),{target:{value:'Team design work'}});
 fireEvent.click(screen.getByRole('button',{name:'Submit request'}));
 expect(await screen.findByText('Try again shortly')).toBeTruthy();expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Design license');
});
