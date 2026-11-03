import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { LeaveDesk } from '@/components/leave-desk/leave-desk';
export default async function LeaveDeskPage({searchParams}:{searchParams:Promise<{tab?:string}>}){const client=await createClient();const {data:{user}}=await client.auth.getUser();if(!user)redirect('/login');const {tab}=await searchParams;return <LeaveDesk key={user.id} userId={user.id} initialTab={['overview','calendar','mine','approvals','insights','settings','ncns'].includes(tab??'')?tab:undefined}/>;}
