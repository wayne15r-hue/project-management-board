import { beforeEach, expect, it, vi } from 'vitest';
const state=vi.hoisted(()=>({cached:null as null|{id:string},upload:vi.fn(),rpc:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:'member'}}})},storage:{from:()=>({upload:state.upload,remove:vi.fn()})},rpc:state.rpc})}));
import { POST } from '@/app/api/service-desk/tickets/[ticketId]/attachments/route';
const ticketId='a0000000-0000-4000-8000-000000000001';
beforeEach(()=>{state.cached=null;state.upload.mockReset().mockResolvedValue({error:null});state.rpc.mockReset().mockImplementation(async(name:string)=>({data:name==='desk_replay_attachment'?state.cached:{id:ticketId},error:null}));});
function request(size=4){const form=new FormData();form.set('file',new File(['x'.repeat(size)],'evidence.txt',{type:'text/plain'}));form.set('operationId','b0000000-0000-4000-8000-000000000001');form.set('expectedRevision','1');return POST(new Request('https://app.test',{method:'POST',body:form}),{params:Promise.resolve({ticketId})});}
it('replays committed attachment operations before attempting an upload that may no longer be permitted',async()=>{
 state.cached={id:ticketId};state.upload.mockResolvedValue({error:{message:'RLS denied'}});
 expect((await request()).status).toBe(201);expect(state.upload).not.toHaveBeenCalled();
});
it('uploads new attachments once and delegates registration to the locked operation',async()=>{
 expect((await request()).status).toBe(201);expect(state.upload).toHaveBeenCalledOnce();
 expect(state.rpc.mock.calls.map(c=>c[0])).toEqual(['desk_replay_attachment','desk_ticket_action']);
});
it('rejects an empty upload before touching storage',async()=>{expect((await request(0)).status).toBe(400);expect(state.upload).not.toHaveBeenCalled();});
