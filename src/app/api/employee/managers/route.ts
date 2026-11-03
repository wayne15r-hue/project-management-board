import { employeeRead } from '@/lib/employee/server';
export const GET=(request:Request)=>employeeRead('employee_manager_search',{p_query:(new URL(request.url).searchParams.get('q')??'').slice(0,100)});
