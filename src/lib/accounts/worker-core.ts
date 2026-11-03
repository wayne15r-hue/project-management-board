import type { AccountOperation } from '@/types/accounts';
export type AccountOutcome='succeeded'|'retry'|'failed'|'ambiguous';
export interface DeletePreparation { targetId:string; avatarPaths:{bucket:string;path:string}[] }
export interface AccountTransport {
  validate:(operation:AccountOperation)=>Promise<boolean>;
  authUser:(userId:string)=>Promise<{id:string;email?:string}|null>;
  resetEmail:(email:string,redirectTo:string)=>Promise<void>;
  ban:(userId:string,enabled:boolean)=>Promise<void>;
  prepareDelete:(operation:AccountOperation)=>Promise<DeletePreparation>;
  removeAvatar:(path:string)=>Promise<void>;
  cleanupMedia:(operation:AccountOperation)=>Promise<boolean>;
  deleteAuth:(userId:string)=>Promise<void>;
  finish:(operation:AccountOperation,outcome:AccountOutcome,error:string|null)=>Promise<void>;
}
export async function processAccountOperation(operation:AccountOperation,t:AccountTransport,appUrl:string):Promise<void> {
  if(!await t.validate(operation))return;
  let emailAttempted=false;
  try {
    if(operation.action==='reset_password') {
      const user=await t.authUser(operation.target_id);
      if(!user?.email||user.id!==operation.target_id){await t.finish(operation,'failed','This account has no email recovery address.');return;}
      if(!await t.validate(operation))return;
      emailAttempted=true;
      await t.resetEmail(user.email,new URL('/auth/recovery',appUrl).toString());
    } else if(operation.action==='deactivate') {
      await t.ban(operation.target_id,true);
      if(!await t.cleanupMedia(operation)){await t.finish(operation,'retry','Call disconnection is still pending.');return;}
    } else if(operation.action==='reactivate') {
      await t.ban(operation.target_id,false);
    } else if(operation.action==='delete') {
      await t.ban(operation.target_id,true);
      if(!await t.cleanupMedia(operation)){await t.finish(operation,'retry','Call disconnection is still pending.');return;}
      if(!await t.validate(operation))return;
      const preparation=await t.prepareDelete(operation);
      if(preparation.targetId!==operation.target_id||!Array.isArray(preparation.avatarPaths))throw new Error('Invalid cleanup preparation');
      for(const avatar of preparation.avatarPaths) {
        if(avatar.bucket!=='avatars'||!avatar.path.startsWith(operation.target_id+'/')||avatar.path.includes('..'))throw new Error('Invalid personal avatar path');
        if(!await t.validate(operation))return;
        await t.removeAvatar(avatar.path);
      }
      if(!await t.validate(operation))return;
      await t.deleteAuth(operation.target_id);
    } else {
      await t.finish(operation,'failed','Unsupported account operation.');return;
    }
    await t.finish(operation,'succeeded',null);
  } catch(error) {
    const status=typeof error==='object'&&error!==null&&'status' in error?Number(error.status):0;
    if(emailAttempted) {
      if(status===429)await t.finish(operation,'retry','The provider is temporarily unavailable.');
      else if(status>=400&&status<500)await t.finish(operation,'failed','The provider rejected the email request.');
      else await t.finish(operation,'ambiguous','The email request outcome could not be confirmed.');
    } else {
      await t.finish(operation,status>=400&&status<500&&status!==429?'failed':'retry','Account cleanup could not be completed.');
    }
  }
}
