import { NextResponse } from 'next/server';
import { accountTarget,type AccountContext } from '@/lib/accounts/server';
import { employeeRead } from '@/lib/employee/server';
export async function GET(_request:Request,context:AccountContext){
 const target=await accountTarget(context);
 return target?employeeRead('account_deletion_preview',{p_target:target}):NextResponse.json({error:'Invalid account.'},{status:400});
}
