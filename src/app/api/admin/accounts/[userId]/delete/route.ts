import { accountAction,type AccountContext } from '@/lib/accounts/server';
import { deletionInput } from '@/lib/accounts/validation';
export const maxDuration=30;
export const POST=(request:Request,context:AccountContext)=>accountAction(request,context,deletionInput,(v,target)=>({p_target:target,p_action:'delete',p_operation:v.operationId,p_payload:{expectedRevision:v.expectedRevision,confirmationEmail:v.confirmationEmail,transfers:v.transfers}}));
