import {redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
import {internalRedirect} from '@/app/(auth)/redirect';
import {NameSetup} from '@/components/profile/name-setup';
export default async function NameSetupPage({searchParams}:{searchParams:Promise<{next?:string}>}){
 const requested=internalRedirect((await searchParams).next??null);const path=new URL(requested,'https://internal.invalid').pathname;
 const next=path==='/dashboard'||path.startsWith('/dashboard/')||path==='/employee-setup'||/^\/invite\/[^/]+$/.test(path)?requested:'/dashboard';
 const client=await createClient();const {data:{user}}=await client.auth.getUser();if(!user)redirect('/login?next='+encodeURIComponent('/name-setup?next='+encodeURIComponent(next)));
 const {data,error}=await client.rpc('profile_name_ready');if(error)throw new Error('Name setup is temporarily unavailable.');if(data===true)redirect(next);
 return <NameSetup userId={user.id} next={next}/>;
}
