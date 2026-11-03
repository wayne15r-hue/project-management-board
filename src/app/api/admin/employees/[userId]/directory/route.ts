import { NextResponse } from 'next/server';
import { accountTarget,type AccountContext } from '@/lib/accounts/server';
import { directoryInput } from '@/lib/accounts/validation';
import { employeeMutation } from '@/lib/employee/server';
export async function PATCH(request:Request,context:AccountContext){
 const target=await accountTarget(context);
 return target?employeeMutation(request,directoryInput,'account_save_directory',v=>({p_user:target,p_fields:v})):NextResponse.json({error:'Invalid account.'},{status:400});
}
