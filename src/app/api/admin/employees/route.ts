import { employeeRead, employeeMutation } from '@/lib/employee/server';
import { adminEmployeeInput } from '@/lib/employee/validation';
export function GET(request:Request) {
  const params=new URL(request.url).searchParams;
  const page=Number(params.get('page')??1);
  const filters:Record<string,string|number>={q:(params.get('q')??'').slice(0,100),page:Number.isSafeInteger(page)&&page>0?Math.min(page,1000000):1};
  for(const key of ['department','manager','role','status','setup'])filters[key]=(params.get(key)??'').slice(0,100);
  return employeeRead('account_directory',{p_filters:filters});
}
export const PATCH=(request:Request)=>employeeMutation(request,adminEmployeeInput,'employee_admin_save',v=>({p_user:v.userId,p_department:v.departmentId,p_title:v.jobTitle,p_manager:v.managerId}));
