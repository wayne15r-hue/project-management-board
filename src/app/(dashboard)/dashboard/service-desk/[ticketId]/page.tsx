import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { uuid } from '@/lib/service-desk/validation';
import { TicketDetail } from '@/components/service-desk/ticket-detail';
export default async function TicketPage({params}:{params:Promise<{ticketId:string}>}){
 const client=await createClient();const {data:{user}}=await client.auth.getUser();if(!user)redirect('/login');
 const {ticketId}=await params;if(!uuid.safeParse(ticketId).success)notFound();
 return <TicketDetail key={`${user.id}:${ticketId}`} userId={user.id} ticketId={ticketId}/>;
}
