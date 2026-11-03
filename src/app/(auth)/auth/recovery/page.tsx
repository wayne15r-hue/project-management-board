'use client';
import { useEffect,useRef,useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function RecoveryPage(){
 const router=useRouter(),started=useRef(false);
 const [expired,setExpired]=useState(false);
 useEffect(()=>{
  if(started.current)return;
  started.current=true;
  const params=new URLSearchParams(window.location.hash.slice(1));
  // Remove bearer credentials before initializing any client or navigating.
  window.history.replaceState(null,'',window.location.pathname);
  const access_token=params.get('access_token'),refresh_token=params.get('refresh_token');
  void (async()=>{
   if(params.get('type')!=='recovery'||!access_token||!refresh_token||params.has('error')){setExpired(true);return;}
   const {data,error}=await createClient().auth.setSession({access_token,refresh_token});
    if(error||!data.user){setExpired(true);return;}
    router.replace('/update-password');router.refresh();
  })().catch(()=>setExpired(true));
 },[router]);
 return <div className="space-y-4"><h1 className="text-2xl font-semibold">Password recovery</h1>{expired?<p role="alert">This recovery link is expired or invalid. <Link className="underline" href="/reset-password">Request a new link</Link>.</p>:<p>Checking your recovery link…</p>}</div>;
}
