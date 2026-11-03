'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
export default function InactiveAccount(){
 const [error,setError]=useState('');
 const router=useRouter();
 async function signOut(){
  const {error}=await createClient().auth.signOut({scope:'local'});
  if(error){setError('Could not sign out. Please retry.');return;}
  router.replace('/login');router.refresh();
 }
 return <div className="space-y-4"><h1 className="text-2xl font-semibold">Account inactive</h1><p>Your account has been deactivated. Contact the Admin Team to restore access.</p><Button onClick={()=>void signOut()}>Sign out</Button>{error&&<p role="alert">{error}</p>}</div>;
}
