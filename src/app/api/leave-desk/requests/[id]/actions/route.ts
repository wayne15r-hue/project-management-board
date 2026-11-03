import { leaveMutation,invalid } from '@/lib/leave-desk/server';
import { actionSchema,uuid } from '@/lib/leave-desk/validation';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){const {id}=await params;if(!uuid.safeParse(id).success)return invalid();return leaveMutation(request,actionSchema,'leave_action',v=>({p_request:id,p_revision:v.revision,p_action:v.action,p_payload:v.payload,p_key:v.key}));}
