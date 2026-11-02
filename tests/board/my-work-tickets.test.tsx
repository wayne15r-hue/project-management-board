// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MyWorkTickets } from '@/components/service-desk/my-work-tickets';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('keeps support-ticket and ticket-review totals distinct and links directly to tickets',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url)=>({ok:true,json:async()=>({items:[{id:String(url).includes('assigned')?'assigned-ticket':'review-ticket',number:1,title:String(url).includes('assigned')?'Fix VPN':'Approve license'}],total:String(url).includes('assigned')?9:3})})));
 render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MyWorkTickets userId="user"/></QueryClientProvider>);
 expect(await screen.findByText('Assigned support tickets (9)')).toBeTruthy();expect(await screen.findByText('Ticket approvals awaiting me (3)')).toBeTruthy();
 expect(screen.getByRole('link',{name:/Fix VPN/}).getAttribute('href')).toBe('/dashboard/service-desk/assigned-ticket');
});
