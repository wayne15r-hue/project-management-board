import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import type { z } from 'zod';

export function employeeError(error:{code?:string;message:string}) {
  if(error.code==='23505'&&error.message.includes('employee_department_name'))return NextResponse.json({error:'A department with this name already exists.'},{status:409});
  const status = error.code==='42501'?403:error.code==='23505'||error.code==='40001'?409:error.code==='22023'||error.code==='23503'||error.code==='23514'?400:500;
  return NextResponse.json({error:status===500?'Employee administration is temporarily unavailable. Please retry.':error.message},{status});
}
export async function employeeRead(name:string,args:Record<string,unknown>={}) {
  const client=await createClient();
  const {data:{user}}=await client.auth.getUser();
  if(!user) return NextResponse.json({error:'Unauthorized'},{status:401});
  const {data,error}=await client.rpc(name,args);
  return error?employeeError(error):NextResponse.json(data,{headers:{'Cache-Control':'private, no-store'}});
}
export async function employeeMutation<T>(request:Request,schema:z.ZodType<T>,name:string,args:(input:T)=>Record<string,unknown>,expectedUserId?:(input:T)=>string) {
  const client=await createClient();
  const {data:{user}}=await client.auth.getUser();
  if(!user) return NextResponse.json({error:'Unauthorized'},{status:401});
  let body:unknown;
  try {body=await request.json();} catch {return NextResponse.json({error:'Invalid JSON'},{status:400});}
  const parsed=schema.safeParse(body);
  if(!parsed.success) return NextResponse.json({error:'Check the required fields and try again.'},{status:400});
  if(expectedUserId&&expectedUserId(parsed.data)!==user.id) return NextResponse.json({error:'Your account has changed. Reload this page before submitting.',code:'ACCOUNT_CHANGED'},{status:409});
  const {data,error}=await client.rpc(name,args(parsed.data));
  return error?employeeError(error):NextResponse.json(data??{ok:true},{headers:{'Cache-Control':'private, no-store'}});
}
