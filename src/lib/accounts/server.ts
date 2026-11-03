import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { employeeError } from '@/lib/employee/server';
import { runAccountMaintenance } from './worker';

export type AccountContext={params:Promise<{userId:string}>};
export async function accountTarget(context:AccountContext) {
  const {userId}=await context.params;
  return z.string().uuid().safeParse(userId).success?userId:null;
}
export async function accountAction<T>(request:Request,context:AccountContext,schema:z.ZodType<T>,args:(value:T,target:string)=>Record<string,unknown>,retry=false) {
  const target=await accountTarget(context);
  if(!target)return NextResponse.json({error:'Invalid account.'},{status:400});
  const db=await createClient();
  const {data:{user}}=await db.auth.getUser();
  if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  let body:unknown;
  try{body=await request.json();}catch{return NextResponse.json({error:'Invalid JSON'},{status:400});}
  const parsed=schema.safeParse(body);
  if(!parsed.success)return NextResponse.json({error:'Check the account action fields.'},{status:400});
  const input=args(parsed.data,target);
  // A retry must also match the target path; do not turn this into an arbitrary job endpoint.
  if(retry){
    const found=await db.rpc('account_operation',{p_target:target,p_operation:input.p_id});
    if(found.error)return employeeError(found.error);
    if(!found.data)return NextResponse.json({error:'Operation not found.'},{status:404});
  }
  const result=await db.rpc(retry?'account_retry_operation':'account_request_action',input);
  if(result.error)return employeeError(result.error);
  // Await bounded work; the durable scheduler resumes provider failures or expired leases.
  try{await runAccountMaintenance(Date.now()+18000);}catch{/* Operation remains durably queued. */}
  const latest=await db.rpc('account_operation',{p_target:target,p_operation:result.data.id});
  return NextResponse.json(latest.error?result.data:latest.data,{headers:{'Cache-Control':'private, no-store'}});
}
