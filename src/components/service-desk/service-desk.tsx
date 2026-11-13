"use client";
import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Plus, Ticket as TicketIcon } from 'lucide-react';
import { deskLabel, ticketReference, ticketStatuses, typeLabels, type DeskTeam, type DeskList, type DeskView } from '@/types/service-desk';
import { actionClass, control, deskRead, ErrorNotice, Field, useDeskAccount } from './shared';
import { NewRequest } from './new-request';
import { AgentSettings } from './settings';
export function ServiceDesk({userId}:{userId:string}){
 const valid=useDeskAccount(userId);
 return valid?<DeskContent key={userId} userId={userId}/>:<p role="status" className="p-6">Updating your session…</p>;
}
function DeskContent({userId}:{userId:string}){
 const [view,setView]=useState<DeskView>('mine');const [team,setTeam]=useState('');const [search,setSearch]=useState('');
 const [type,setType]=useState('');const [status,setStatus]=useState('');const [priority,setPriority]=useState('');const [assignee,setAssignee]=useState('');const [page,setPage]=useState(1);const [creating,setCreating]=useState(false);const [settings,setSettings]=useState(false);
 const context=useQuery({queryKey:['service-desk',userId,'teams'],queryFn:({signal})=>deskRead<{teams:DeskTeam[]}>('/api/service-desk/teams',signal),gcTime:0,retry:false,refetchOnWindowFocus:'always'});
 const params=new URLSearchParams({view,search,page:String(page)});for(const [key,value] of Object.entries({team,type,status,priority,assignee}))if(value)params.set(key,value);
 const tickets=useQuery({queryKey:['service-desk',userId,'list',params.toString()],queryFn:({signal})=>deskRead<DeskList>(`/api/service-desk/tickets?${params}`,signal),enabled:!!context.data?.teams.length,gcTime:0,retry:false,refetchOnWindowFocus:'always',refetchInterval:30000});
 const teams=context.data?.teams??[];const members=Array.from(new Map(teams.filter(t=>!team||t.id===team).flatMap(t=>t.members).map(m=>[m.id,m])).values());
 const filter=(set:(s:string)=>void)=>(value:string)=>{set(value);setPage(1);};
 const data=tickets.error?undefined:tickets.data;const totalPages=Math.max(1,Math.ceil((data?.total??0)/25));
 return <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6 md:py-8">
 <header className="mb-6 flex flex-wrap items-start justify-between gap-4"><div><h1 className="flex items-center gap-2 text-2xl font-bold"><TicketIcon className="h-6 w-6"/>Service Desk</h1><p className="mt-1 text-sm text-muted-foreground">IT support, access, tools, and technical requests.</p></div>
 {teams.length>0&&<div className="flex flex-wrap gap-2">{teams.some(t=>t.admin)&&<button type="button" className={actionClass} onClick={()=>setSettings(!settings)}>Manage support</button>}<button type="button" className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground" onClick={()=>setCreating(!creating)}><Plus className="h-4 w-4"/>New request</button></div>}</header>
 {context.isPending&&<p role="status">Loading Service Desk…</p>}{context.error&&<ErrorNotice message={context.error.message} retry={()=>void context.refetch()}/>}
 {context.data&&teams.length===0?<div className="rounded-xl border border-border p-8 text-center"><p>Join or create a team to submit requests and use its Service Desk.</p><Link href="/dashboard/teams" className="mt-3 inline-block text-primary underline">Manage teams</Link></div>:teams.length>0&&<>
 {settings&&<AgentSettings userId={userId} teams={teams.filter(t=>t.admin)}/>}
 {creating&&<NewRequest userId={userId} teams={teams} onClose={()=>setCreating(false)}/>}
 <div role="tablist" aria-label="Ticket views" className="mb-5 flex flex-wrap gap-2">{([['mine','My Requests'],['queue','Team Queue'],['reviews','Awaiting My Approval']] as const).filter(([v])=>v!=='queue'||teams.some(t=>t.support)).map(([v,label])=><button key={v} type="button" role="tab" aria-selected={view===v} className={`${actionClass} ${view===v?'bg-accent font-semibold':''}`} onClick={()=>{setView(v);setPage(1);}}>{label} <span className="ml-1 text-muted-foreground">{data?.counts[v]??'…'}</span></button>)}</div>
 <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
 <Field label="Search tickets"><input className={control} placeholder="Title or SD-000001" value={search} onChange={e=>filter(setSearch)(e.target.value)}/></Field>
 <Field label="Filter team"><select className={control} value={team} onChange={e=>{filter(setTeam)(e.target.value);setAssignee('');}}><option value="">All teams</option>{teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
 <Field label="Filter type"><select className={control} value={type} onChange={e=>filter(setType)(e.target.value)}><option value="">All types</option>{Object.entries(typeLabels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></Field>
 <Field label="Filter status"><select className={control} value={status} onChange={e=>filter(setStatus)(e.target.value)}><option value="">All statuses</option>{ticketStatuses.map(v=><option key={v} value={v}>{deskLabel(v)}</option>)}</select></Field>
 <Field label="Filter priority"><select className={control} value={priority} onChange={e=>filter(setPriority)(e.target.value)}><option value="">All priorities</option>{['low','medium','high'].map(v=><option key={v} value={v}>{deskLabel(v)}</option>)}</select></Field>
 <Field label="Filter assignee"><select className={control} value={assignee} onChange={e=>filter(setAssignee)(e.target.value)}><option value="">All assignees</option>{members.filter(m=>m.support).map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
 </div>
 {tickets.isPending&&<p role="status">Loading tickets…</p>}{tickets.error&&<ErrorNotice message={tickets.error.message} retry={()=>void tickets.refetch()}/>}
 {data&&<><p className="mb-3 text-sm text-muted-foreground">{data.total} matching {data.total===1?'ticket':'tickets'}</p>{data.items.length===0?<div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">No tickets match this view.</div>:<ul className="divide-y divide-border rounded-xl border border-border">{data.items.map(t=><li key={t.id}><Link className="flex flex-col gap-2 p-4 hover:bg-accent/50 sm:flex-row sm:items-center sm:justify-between" href={`/dashboard/service-desk/${t.id}`}><div className="min-w-0"><p className="text-xs text-muted-foreground">{ticketReference(t.number)} · {teams.find(team=>team.id===t.team_id)?.name}</p><p className="break-words font-medium">{t.title}</p><p className="mt-1 text-xs text-muted-foreground">{typeLabels[t.type]} · {members.find(m=>m.id===t.assignee_id)?.name??'Unassigned'}{t.due_date?` · Due ${t.due_date}`:''}</p></div><div className="flex shrink-0 flex-wrap gap-2 text-xs"><span className="rounded bg-muted px-2 py-1">{deskLabel(t.priority)}</span><span className="rounded bg-muted px-2 py-1">{deskLabel(t.status)}</span>{t.approval_status!=='not_requested'&&<span className="rounded bg-primary/10 px-2 py-1">{deskLabel(t.approval_status)}</span>}</div></Link></li>)}</ul>}
 <nav aria-label="Ticket pages" className="mt-4 flex items-center justify-between gap-3"><button type="button" className={actionClass} disabled={page<=1} onClick={()=>setPage(p=>p-1)}>Previous</button><span className="text-sm">Page {page} of {totalPages}</span><button type="button" className={actionClass} disabled={page>=totalPages} onClick={()=>setPage(p=>p+1)}>Next</button></nav>{page>totalPages&&<button type="button" className="mt-2 text-sm underline" onClick={()=>setPage(1)}>Return to first page</button>}</>}
 </>}
 </div>;
}
