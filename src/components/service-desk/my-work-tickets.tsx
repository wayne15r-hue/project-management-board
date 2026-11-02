"use client";
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ticketReference, type DeskList } from '@/types/service-desk';
import { deskRead, ErrorNotice } from './shared';
export function MyWorkTickets({userId}:{userId:string}){
 return <section aria-label="Service Desk work" className="mb-6 rounded-xl border border-border p-4"><div className="mb-4 flex items-center justify-between gap-3"><h2 className="font-semibold">Service Desk</h2><Link href="/dashboard/service-desk" className="text-sm text-primary underline">Open Service Desk</Link></div><div className="grid gap-5 sm:grid-cols-2"><TicketWorkGroup userId={userId} view="assigned" label="Assigned support tickets"/><TicketWorkGroup userId={userId} view="reviews" label="Ticket approvals awaiting me"/></div></section>;
}
function TicketWorkGroup({userId,view,label}:{userId:string;view:'assigned'|'reviews';label:string}){
 const work=useQuery({queryKey:['service-desk',userId,'work',view],queryFn:({signal})=>deskRead<DeskList>(`/api/service-desk/tickets?view=${view}`,signal),gcTime:0,retry:false,refetchInterval:30000,refetchOnWindowFocus:'always'});
 return <div><h3 className="mb-2 text-sm font-medium">{label}{work.data&&!work.error?` (${work.data.total})`:''}</h3>{work.isPending&&<p role="status" className="text-xs text-muted-foreground">Loading tickets…</p>}{work.error&&<ErrorNotice message={work.error.message} retry={()=>void work.refetch()}/>}{work.data&&!work.error&&(work.data.items.length?<ul className="space-y-2">{work.data.items.slice(0,5).map(t=><li key={t.id}><Link className="block break-words text-sm text-primary hover:underline" href={`/dashboard/service-desk/${t.id}`}><span className="text-xs text-muted-foreground">{ticketReference(t.number)} </span>{t.title}</Link></li>)}</ul>:<p className="text-xs text-muted-foreground">Nothing pending.</p>)}</div>;
}
