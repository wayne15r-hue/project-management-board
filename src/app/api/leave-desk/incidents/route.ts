import { leaveRead,leaveMutation } from '@/lib/leave-desk/server';
import { incidentSchema } from '@/lib/leave-desk/validation';
export async function GET(){return leaveRead('leave_incidents');}
export async function POST(request:Request){return leaveMutation(request,incidentSchema,'leave_incident',v=>({p_payload:v.payload,p_key:v.key}));}
