import { leaveMutation } from '@/lib/leave-desk/server';
import { settingsSchema } from '@/lib/leave-desk/validation';
export async function POST(request:Request){return leaveMutation(request,settingsSchema,'leave_settings',v=>({p_kind:v.kind,p_payload:v.payload,p_key:v.key}));}
