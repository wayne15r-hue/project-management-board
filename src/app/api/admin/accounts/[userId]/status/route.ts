import { accountAction,type AccountContext } from '@/lib/accounts/server';
import { statusInput } from '@/lib/accounts/validation';
export const maxDuration=30;
export const PATCH=(request:Request,context:AccountContext)=>accountAction(request,context,statusInput,(v,target)=>({p_target:target,p_action:v.action,p_operation:v.operationId,p_payload:{expectedRevision:v.expectedRevision}}));
