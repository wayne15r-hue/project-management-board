import { beforeEach, expect, it, vi } from 'vitest';
const state=vi.hoisted(()=>({user:{id:'member'} as {id:string}|null,row:{storage_path:'ticket/secret.txt',file_name:'secret.txt'} as {storage_path:string;file_name:string}|null,download:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({auth:{getUser:async()=>({data:{user:state.user}})},from:()=>{const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:state.row,error:null})};return q;}})}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({storage:{from:()=>({download:state.download})}})}));
import { GET } from '@/app/api/service-desk/tickets/[ticketId]/attachments/[attachmentId]/route';
const ctx={params:Promise.resolve({ticketId:'a0000000-0000-4000-8000-000000000001',attachmentId:'b0000000-0000-4000-8000-000000000001'})};
beforeEach(()=>{state.user={id:'member'};state.row={storage_path:'ticket/secret.txt',file_name:'secret.txt'};state.download.mockReset().mockResolvedValue({data:new Blob(['private bytes']),error:null});});
it('does not retrieve storage bytes without an authenticated and RLS-visible attachment',async()=>{
 state.user=null;expect((await GET(new Request('https://app.test'),ctx)).status).toBe(401);state.user={id:'member'};state.row=null;
 expect((await GET(new Request('https://app.test'),ctx)).status).toBe(404);expect(state.download).not.toHaveBeenCalled();
});
it('returns a private non-cacheable attachment response without a signed URL',async()=>{
 const response=await GET(new Request('https://app.test'),ctx);
 expect(response.status).toBe(200);expect(await response.text()).toBe('private bytes');expect(state.download).toHaveBeenCalledWith('ticket/secret.txt');
 expect(response.headers.get('cache-control')).toBe('private, no-store');expect(response.headers.get('content-disposition')).toContain('attachment;');
});
