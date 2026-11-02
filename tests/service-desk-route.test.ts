import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ user: { id: 'user' } as {id:string}|null, calls: [] as unknown[], error: null as null|{code:string;message:string} }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({
  auth: { getUser: async () => ({ data: { user: state.user } }) },
  rpc: async (name: string, args: unknown) => { state.calls.push({name,args}); return { data: { id: 'ticket' }, error: state.error }; },
}) }));
import { POST } from '@/app/api/service-desk/tickets/[ticketId]/actions/route';
const ticketId = 'b0000000-0000-4000-8000-000000000001';
const payload = { action: 'comment', text: 'Screenshot supplied', operationId: 'c0000000-0000-4000-8000-000000000001', expectedRevision: 1 };
const post = (body: unknown, id = ticketId) => POST(new Request('https://app.test', { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ticketId:id}) });
beforeEach(() => { state.user={id:'user'};state.calls=[];state.error=null; });
it('requires authentication and validates identifiers before RPC', async () => {
  state.user=null;expect((await post(payload)).status).toBe(401);state.user={id:'user'};
  for(const body of [{...payload,operationId:'bad'},{...payload,expectedRevision:0},{...payload,text:''},{...payload,action:'admin_override'}]) expect((await post(body)).status).toBe(400);
  expect((await post(payload,'invalid')).status).toBe(400);expect(state.calls).toEqual([]);
});
it('preserves operation identity and delegates authorization to the database', async () => {
  expect((await post(payload)).status).toBe(200);
  const {action,...body}=payload;
  expect(state.calls).toEqual([{name:'desk_ticket_action',args:{p_ticket:ticketId,p_action:action,p_payload:body}}]);
});
it.each([['42501',403],['40001',409],['22023',400],['XX000',500]])('maps database errors %s to %s without leaking internals',async(code,status)=>{
  state.error={code,message:code==='XX000'?'sensitive internals':'Ticket changed'};
  const res=await post(payload);expect(res.status).toBe(status);if(status===500)expect(await res.text()).not.toContain('sensitive');
});
