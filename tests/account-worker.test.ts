import { beforeEach,expect,it,vi } from 'vitest';
import { processAccountOperation, type AccountTransport } from '@/lib/accounts/worker-core';
import type { AccountOperation } from '@/types/accounts';
const operation:AccountOperation={id:'operation',actor_id:'admin',target_id:'target',action:'reset_password',status:'running',payload:{email:'forged@example.test'},attempts:1,last_error:null,created_at:'now',updated_at:'now',lease_token:'lease'};
let t:AccountTransport;
beforeEach(()=>{t={validate:vi.fn(async()=>true),authUser:vi.fn(async()=>({id:'target',email:'verified@example.test'})),resetEmail:vi.fn(async()=>{}),ban:vi.fn(async()=>{}),prepareDelete:vi.fn(async()=>({targetId:'target',avatarPaths:[{bucket:'avatars',path:'target/avatar.png'}]})),removeAvatar:vi.fn(async()=>{}),cleanupMedia:vi.fn(async()=>true),deleteAuth:vi.fn(async()=>{}),finish:vi.fn(async()=>{})};});
it('resolves the Auth email and never trusts an email in the operation payload',async()=>{
  await processAccountOperation(operation,t,'https://app.test');
  expect(t.resetEmail).toHaveBeenCalledWith('verified@example.test','https://app.test/auth/recovery');
  expect(t.finish).toHaveBeenCalledWith(operation,'succeeded',null);
});
it('does not call providers after authorization is revoked',async()=>{
  vi.mocked(t.validate).mockResolvedValue(false);
  await processAccountOperation(operation,t,'https://app.test');
  expect(t.resetEmail).not.toHaveBeenCalled();expect(t.ban).not.toHaveBeenCalled();
});
it('marks an uncertain reset as ambiguous without storing the provider exception',async()=>{
  vi.mocked(t.resetEmail).mockRejectedValue(new Error('secret recovery token abc'));
  await processAccountOperation(operation,t,'https://app.test');
  expect(t.finish).toHaveBeenCalledWith(operation,'ambiguous','The email request outcome could not be confirmed.');
});
it('retries rate limits without claiming email delivery',async()=>{
  vi.mocked(t.resetEmail).mockRejectedValue(Object.assign(new Error('rate limit'),{status:429}));
  await processAccountOperation(operation,t,'https://app.test');
  expect(t.finish).toHaveBeenCalledWith(operation,'retry','The provider is temporarily unavailable.');
});
it('keeps deactivation pending when media revocation has not completed',async()=>{
  vi.mocked(t.cleanupMedia).mockResolvedValue(false);
  await processAccountOperation({...operation,action:'deactivate'},t,'https://app.test');
  expect(t.ban).toHaveBeenCalledWith('target',true);
  expect(t.finish).toHaveBeenCalledWith(expect.anything(),'retry','Call disconnection is still pending.');
});
it('unbans before acknowledging reactivation',async()=>{
  const events:string[]=[];vi.mocked(t.ban).mockImplementation(async()=>{events.push('unban');});vi.mocked(t.finish).mockImplementation(async()=>{events.push('finish');});
  await processAccountOperation({...operation,action:'reactivate'},t,'https://app.test');
  expect(t.ban).toHaveBeenCalledWith('target',false);expect(events).toEqual(['unban','finish']);
});
it('removes only personal avatars and completes cleanup before deleting Auth',async()=>{
  const events:string[]=[];vi.mocked(t.removeAvatar).mockImplementation(async()=>{events.push('avatar');});vi.mocked(t.deleteAuth).mockImplementation(async()=>{events.push('auth');});
  await processAccountOperation({...operation,action:'delete'},t,'https://app.test');
  expect(events).toEqual(['avatar','auth']);expect(t.finish).toHaveBeenCalledWith(expect.anything(),'succeeded',null);
});
it('does not delete Auth on partial storage failure or stale authorization',async()=>{
  vi.mocked(t.removeAvatar).mockRejectedValue(new Error('private storage internals'));
  await processAccountOperation({...operation,action:'delete'},t,'https://app.test');
  expect(t.deleteAuth).not.toHaveBeenCalled();expect(t.finish).toHaveBeenCalledWith(expect.anything(),'retry','Account cleanup could not be completed.');
});
it('rejects a cleanup path outside the target personal avatar namespace',async()=>{
  vi.mocked(t.prepareDelete).mockResolvedValue({targetId:'target',avatarPaths:[{bucket:'chat-files',path:'private/file'}]});
  await processAccountOperation({...operation,action:'delete'},t,'https://app.test');
  expect(t.removeAvatar).not.toHaveBeenCalled();expect(t.deleteAuth).not.toHaveBeenCalled();
});
