import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ServiceDesk } from '@/components/service-desk/service-desk';
export default async function ServiceDeskPage(){
 const client=await createClient();const {data:{user}}=await client.auth.getUser();if(!user)redirect('/login');
 return <ServiceDesk key={user.id} userId={user.id}/>;
}
