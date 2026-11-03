import { beforeEach, expect, it, vi } from 'vitest';
const state=vi.hoisted(()=>({user:{id:'member'} as {id:string}|null,row:null as Record<string,unknown>|null,upload:vi.fn(),download:vi.fn(),rpc:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({auth:{getUser:async()=>({data:{user:state.user}})},from:()=>{const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:state.row,error:null})};return q;},storage:{from:()=>({upload:state.upload})},rpc:state.rpc})}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({storage:{from:()=>({download:state.download})}})}));
import { POST } from '@/app/api/leave-desk/requests/[id]/files/route';
import { GET } from '@/app/api/leave-desk/requests/[id]/files/[fileId]/route';
const id='a0000000-0000-4000-8000-000000000001',fileId='b0000000-0000-4000-8000-000000000001';
const ctx={params:Promise.resolve({id,fileId})};
function upload(type='application/pdf',content='%PDF-1.7\nfixture'){const form=new FormData();form.set('file',new File([content],'medical.pdf',{type}));form.set('key',fileId);return POST(new Request('https://app.test',{method:'POST',body:form}),ctx);}
beforeEach(()=>{state.user={id:'member'};state.row=null;state.upload.mockReset().mockResolvedValue({error:null});state.download.mockReset().mockResolvedValue({data:new Blob(['private']),error:null});state.rpc.mockReset().mockResolvedValue({data:{id:fileId},error:null});});
it('never fetches medical bytes without authentication and a currently visible metadata row',async()=>{
 state.user=null;expect((await GET(new Request('https://app.test'),ctx)).status).toBe(401);state.user={id:'member'};
 expect((await GET(new Request('https://app.test'),ctx)).status).toBe(404);expect(state.download).not.toHaveBeenCalled();
});
it('proxies an authorized download with no-store/nosniff and no signed URL',async()=>{
 state.row={path:`${id}/${fileId}`,name:'medical.pdf'};const res=await GET(new Request('https://app.test'),ctx);
 expect(res.status).toBe(200);expect(await res.text()).toBe('private');expect(res.headers.get('cache-control')).toBe('private, no-store');expect(res.headers.get('x-content-type-options')).toBe('nosniff');expect(res.headers.get('content-disposition')).toContain('attachment;');
});
it('accepts PDF, registers its digest, and rejects unsupported or mismatched bytes before upload',async()=>{
 expect((await upload('text/html')).status).toBe(400);expect((await upload('application/pdf','not a pdf')).status).toBe(400);expect(state.upload).not.toHaveBeenCalled();
 expect((await upload()).status).toBe(201);expect(state.upload).toHaveBeenCalledOnce();expect(state.rpc).toHaveBeenCalledWith('leave_register_file',expect.objectContaining({p_request:id,p_payload:expect.objectContaining({id:fileId,sha256:expect.stringMatching(/^[a-f0-9]{64}$/)})}));
});
it('requires authorization before upload and never removes a committed object after a registration error',async()=>{
 state.user=null;expect((await upload()).status).toBe(401);expect(state.upload).not.toHaveBeenCalled();state.user={id:'member'};
 state.rpc.mockResolvedValue({data:null,error:{code:'42501',message:'Forbidden'}});expect((await upload()).status).toBe(403);
});
it('recovers an orphan upload on retry only after current authorization and byte equality',async()=>{
 state.upload.mockResolvedValue({error:{statusCode:'409',message:'Already exists'}});
 state.rpc.mockImplementation(async(name:string)=>({data:name==='leave_can_read'?true:{id:fileId},error:null}));
 state.download.mockResolvedValue({data:new Blob(['%PDF-1.7\nfixture']),error:null});
 expect((await upload()).status).toBe(201);expect(state.rpc).toHaveBeenCalledWith('leave_can_read',{p_request:id});
 expect(state.rpc).toHaveBeenCalledWith('leave_register_file',expect.anything());
 state.rpc.mockClear();state.download.mockResolvedValue({data:new Blob(['different contents']),error:null});
 expect((await upload()).status).toBe(409);expect(state.rpc.mock.calls.some(([name])=>name==='leave_register_file')).toBe(false);
});
it('does not read orphan bytes after access revocation',async()=>{
 state.upload.mockResolvedValue({error:{statusCode:'409',message:'Already exists'}});state.rpc.mockResolvedValue({data:false,error:null});
 expect((await upload()).status).toBe(403);expect(state.download).not.toHaveBeenCalled();
});
