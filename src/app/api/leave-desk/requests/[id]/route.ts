import { leaveRead,invalid } from '@/lib/leave-desk/server';
import { uuid } from '@/lib/leave-desk/validation';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){const {id}=await params;if(!uuid.safeParse(id).success)return invalid();return leaveRead('leave_detail',{p_request:id});}
