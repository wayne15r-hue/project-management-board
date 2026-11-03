'use client';
import { useRouter } from 'next/navigation';
import { EmployeeForm } from './employee-form';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import type { EmployeeState } from '@/types/employee';
import { AuthSessionBoundary } from '@/components/shared/auth-session-boundary';
export function EmployeeSetup({state,next}:{state:EmployeeState;next:string}) {
  const router=useRouter();
  return <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center px-6 py-12">
    <h1 className="text-2xl font-semibold">Your employee details</h1>
    <p className="mt-2 mb-6 text-sm text-muted-foreground">Complete this once to continue to Helios. An admin can update these details later if your role changes.</p>
    <EmployeeForm userId={state.userId} departments={state.departments} onSave={async value=>{
      const response=await fetch('/api/employee/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...value,userId:state.userId})});
      const data=await response.json();
      if(!response.ok){
        if(response.status===409&&data.code!=='ACCOUNT_CHANGED'){router.replace(next);router.refresh();return;}
        throw new Error(data.error??'Could not save employee details');
      }
      router.replace(next);router.refresh();
    }}/>
    <Button className="mt-6 self-start" variant="ghost" onClick={async()=>{await createClient().auth.signOut();router.replace('/login');router.refresh();}}>Sign out</Button>
  </div>;
}
export function BoundEmployeeSetup(props:{state:EmployeeState;next:string}) {
  return <AuthSessionBoundary key={props.state.userId} userId={props.state.userId}><EmployeeSetup {...props}/></AuthSessionBoundary>;
}
