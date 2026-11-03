import { employeeRead, employeeMutation } from '@/lib/employee/server';
import { adminInput } from '@/lib/employee/validation';
export const POST=(request:Request)=>employeeMutation(request,adminInput,'employee_set_admin',v=>({p_user:v.userId,p_enabled:v.enabled}));
export const GET=()=>employeeRead('employee_admin_list');
