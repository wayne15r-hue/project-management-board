"use client";
import { useState } from 'react';
import type { DeskTeam } from '@/types/service-desk';
import { actionClass, control, ErrorNotice, Field, useDeskMutation } from './shared';
export function AgentSettings({userId,teams}:{userId:string;teams:DeskTeam[]}){
 const [teamId,setTeam]=useState(teams[0]?.id??'');const team=teams.find(t=>t.id===teamId);
 const save=useDeskMutation(userId,`/api/service-desk/teams/${teamId}/agents`);
 return <section aria-label="Support settings" className="mb-6 space-y-4 rounded-xl border border-border p-4"><h2 className="font-semibold">Support agents</h2><p className="text-sm text-muted-foreground">Owners and admins manage the desk automatically. Agents can see and manage every ticket in this team.</p>
 <Field label="Support team"><select className={control} value={teamId} onChange={e=>setTeam(e.target.value)}>{teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
 {save.error&&<ErrorNotice message={save.error.message}/>}
 <ul className="divide-y divide-border">{team?.members.map(m=><li className="flex flex-wrap items-center justify-between gap-3 py-2" key={m.id}><span className="min-w-0 break-words text-sm">{m.name} <span className="text-muted-foreground">({m.role})</span></span>{['owner','admin'].includes(m.role)?<span className="text-xs text-muted-foreground">Desk administrator</span>:<button className={actionClass} type="button" disabled={save.isPending} onClick={()=>save.mutate({userId:m.id,enabled:!m.support})}>{m.support?'Remove agent':'Make agent'}</button>}</li>)}</ul></section>;
}
