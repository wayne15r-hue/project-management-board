import { employeeMutation } from '@/lib/employee/server';
import { departmentInput } from '@/lib/employee/validation';
export const POST=(request:Request)=>employeeMutation(request,departmentInput,'employee_save_department',v=>({p_id:v.id,p_name:v.name,p_archived:v.archived}));
