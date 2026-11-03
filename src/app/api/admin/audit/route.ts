import { employeeRead } from '@/lib/employee/server';
export function GET(request:Request){
 const params=new URL(request.url).searchParams,page=Number(params.get('page')??1);
 return employeeRead('account_audit',{p_query:(params.get('q')??'').slice(0,100),p_page:Number.isSafeInteger(page)&&page>0?Math.min(page,1000000):1});
}
