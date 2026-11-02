import { beforeEach, expect, it, vi } from 'vitest';
const state=vi.hoisted(()=>({calls:[] as unknown[]}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({rpc:async(name:string,args:unknown)=>{state.calls.push({name,args});return {error:null};}})}));
import { createNotification } from '@/lib/notifications';
beforeEach(()=>{state.calls=[];});
it('uses only the durable compatibility RPC with source identity',async()=>{
 await createNotification({recipientId:'r',actorId:'a',type:'comment',cardId:'c',boardId:'b',activityLogId:'source',title:'Comment'});
 expect(state.calls).toMatchObject([{name:'workflow_notify_legacy',args:{p_activity_log_id:'source',p_recipient_id:'r'}}]);
});
it('suppresses self alerts',async()=>{await createNotification({recipientId:'a',actorId:'a',type:'assignment',cardId:'c',boardId:'b',title:'x'});expect(state.calls).toEqual([]);});
