"use client";
import {useRouter} from 'next/navigation';
import {NameForm} from './name-form';
import {AuthSessionBoundary} from '@/components/shared/auth-session-boundary';
import {BrandLogo} from '@/components/shared/brand-logo';
import {createClient} from '@/lib/supabase/client';
import {Button} from '@/components/ui/button';
export function NameSetup({userId,next}:{userId:string;next:string}){
 const router=useRouter();
 return <AuthSessionBoundary key={userId} userId={userId}><main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center gap-6 px-6 py-12"><BrandLogo className="text-primary"/><h1 className="text-2xl font-semibold">What should your team call you?</h1><p className="text-sm text-muted-foreground">Set your name once to continue. A surname is optional. An administrator can correct your name later.</p>
 <NameForm onSave={async value=>{const response=await fetch('/api/profile/name',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...value,userId})});const data=await response.json();if(!response.ok&&!(response.status===409&&data.code!=='ACCOUNT_CHANGED'))throw new Error(data.error||'Could not save your name.');router.replace(next);router.refresh();}}/>
 <Button className="self-start" variant="ghost" onClick={async()=>{await createClient().auth.signOut();router.replace('/login');router.refresh();}}>Sign out</Button>
 </main></AuthSessionBoundary>;
}
