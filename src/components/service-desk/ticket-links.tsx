"use client";
import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { DeskDetail } from '@/types/service-desk';
import { actionClass, control, deskRead, ErrorNotice, Field, useDeskMutation } from './shared';
export function LinkedTasks({userId,detail}:{userId:string;detail:DeskDetail}){
 const {ticket:t,team}=detail;const [search,setSearch]=useState('');const [selected,setSelected]=useState('');const [show,setShow]=useState(false);
 const save=useDeskMutation(userId,`/api/service-desk/tickets/${t.id}/actions`);
 const tasks=useQuery({queryKey:['service-desk',userId,'tasks',team.id,search],queryFn:({signal})=>deskRead<{tasks:{id:string;title:string}[]}>(`/api/service-desk/teams/${team.id}/tasks?search=${encodeURIComponent(search)}`,signal),enabled:team.support&&show,gcTime:0,retry:false});
 return <section className="space-y-3 rounded-xl border border-border p-4"><h2 className="font-semibold">Linked board tasks</h2><p className="text-xs text-muted-foreground">Board permissions apply separately. Ticket and task statuses are independent.</p>
 {detail.links.length===0?<p className="text-sm text-muted-foreground">No accessible linked tasks.</p>:<ul className="space-y-2">{detail.links.map(l=><li key={l.card_id} className="flex items-center justify-between gap-3"><Link href={`/dashboard/board/${l.board_id}?card=${l.card_id}`} className="break-words text-sm text-primary underline">{l.title}</Link>{team.support&&<button type="button" className={actionClass} disabled={save.isPending} onClick={()=>save.mutate({action:'link',cardId:l.card_id,remove:true,expectedRevision:t.revision})}>Unlink</button>}</li>)}</ul>}
 {team.support&&<><button type="button" className={actionClass} onClick={()=>setShow(!show)}>{show?'Cancel linking':'Link existing task'}</button>{show&&<form className="space-y-3" onSubmit={e=>{e.preventDefault();save.mutate({action:'link',cardId:selected,expectedRevision:t.revision});}}><Field label="Find board task"><input className={control} maxLength={200} value={search} onChange={e=>setSearch(e.target.value)}/></Field><Field label="Board task"><select required className={control} value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Choose task</option>{tasks.data?.tasks.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></Field>{tasks.isPending&&<p role="status" className="text-sm">Loading tasks…</p>}{tasks.error&&<ErrorNotice message={tasks.error.message} retry={()=>void tasks.refetch()}/>}<button disabled={save.isPending} className={actionClass}>Link task</button></form>}</>}{save.error&&<ErrorNotice message={save.error.message}/>}</section>;
}
