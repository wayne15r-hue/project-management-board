import { NextResponse } from 'next/server';
import { z } from 'zod';
import { accountAction,accountTarget,type AccountContext } from '@/lib/accounts/server';
import { operationInput } from '@/lib/accounts/validation';
import { employeeRead } from '@/lib/employee/server';
export const maxDuration=30;
export async function GET(request:Request,context:AccountContext){
 const target=await accountTarget(context),id=new URL(request.url).searchParams.get('operationId');
 if(!target||(id&&!z.string().uuid().safeParse(id).success))return NextResponse.json({error:'Invalid operation.'},{status:400});
 return employeeRead('account_operation',{p_target:target,p_operation:id});
}
export const POST=(request:Request,context:AccountContext)=>accountAction(request,context,operationInput,v=>({p_id:v.operationId}),true);
