import { employeeRead, employeeMutation } from '@/lib/employee/server';
import { employeeSetupInput } from '@/lib/employee/validation';
export const GET=()=>employeeRead('employee_setup_state');
export const POST=(request:Request)=>employeeMutation(request,employeeSetupInput,'employee_submit',v=>({p_department:v.departmentId,p_title:v.jobTitle,p_manager:v.managerId}),v=>v.userId);
