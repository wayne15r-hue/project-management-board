import { accountAction,type AccountContext } from '@/lib/accounts/server';
import { operationInput } from '@/lib/accounts/validation';
export const maxDuration=30;
export const POST=(request:Request,context:AccountContext)=>accountAction(request,context,operationInput,(v,target)=>({p_target:target,p_action:'reset_password',p_operation:v.operationId,p_payload:{}}));
