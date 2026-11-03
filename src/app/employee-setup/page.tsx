import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { BoundEmployeeSetup } from '@/components/employee/employee-setup';
import { internalRedirect } from '@/app/(auth)/redirect';
import type { EmployeeState } from '@/types/employee';
export default async function EmployeeSetupPage({searchParams}:{searchParams:Promise<{next?:string}>}) {
  const requested=internalRedirect((await searchParams).next??null);
  const destinationPath=new URL(requested,'https://internal.invalid').pathname;
  const next=destinationPath==='/dashboard'||destinationPath.startsWith('/dashboard/')||/^\/invite\/[^/]+$/.test(destinationPath)?requested:'/dashboard';
  const client=await createClient();
  const {data:{user}}=await client.auth.getUser();
  if(!user)redirect('/login?next='+encodeURIComponent('/employee-setup?next='+encodeURIComponent(next)));
  const {data,error}=await client.rpc('employee_setup_state');
  if(error)throw new Error('Employee setup is temporarily unavailable. Please retry.');
  const state=data as EmployeeState;
  if(state.record?.completed_at)redirect(next);
  return <BoundEmployeeSetup state={state} next={next}/>;
}
