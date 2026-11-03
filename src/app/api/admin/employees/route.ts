import { employeeRead, employeeMutation } from '@/lib/employee/server';
import { adminEmployeeInput } from '@/lib/employee/validation';
export function GET(request:Request) {
  const params=new URL(request.url).searchParams;
  const page=Number(params.get('page')??1);
  return employeeRead('employee_directory',{p_query:(params.get('q')??'').slice(0,100),p_page:Number.isSafeInteger(page)&&page>0?page:1});
}
export const PATCH=(request:Request)=>employeeMutation(request,adminEmployeeInput,'employee_admin_save',v=>({p_user:v.userId,p_department:v.departmentId,p_title:v.jobTitle,p_manager:v.managerId}));
