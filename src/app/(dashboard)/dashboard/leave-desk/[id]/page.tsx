import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { LeaveRequestDetail } from '@/components/leave-desk/request-detail';
export default async function LeaveDetailPage({params}:{params:Promise<{id:string}>}){const client=await createClient();const {data:{user}}=await client.auth.getUser();if(!user)redirect('/login');const {id}=await params;return <LeaveRequestDetail key={user.id} userId={user.id} id={id}/>;}
