"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { typeLabels, type DeskTeam, type TicketType } from '@/types/service-desk';
import { actionClass, control, ErrorNotice, Field, RequestFields, useDeskMutation } from './shared';
export function NewRequest({userId,teams,onClose}:{userId:string;teams:DeskTeam[];onClose:()=>void}){
 const router=useRouter();const [teamId,setTeam]=useState(teams[0]?.id??'');const [type,setType]=useState<TicketType>('it_issue');
 const [title,setTitle]=useState('');const [description,setDescription]=useState('');const [priority,setPriority]=useState('medium');const [fields,setFields]=useState<Record<string,string>>({});
 const save=useDeskMutation(userId,'/api/service-desk/tickets',data=>{onClose();router.push(`/dashboard/service-desk/${(data as {id:string}).id}`);});
 return <section aria-labelledby="new-request-title" className="mb-6 rounded-xl border border-border bg-card p-4 md:p-6"><h2 id="new-request-title" className="mb-4 text-lg font-semibold">New request</h2>
 <form onSubmit={e=>{e.preventDefault();save.mutate({teamId,type,title,description,priority,fields});}} className="space-y-4">
 <fieldset disabled={save.isPending} className="grid gap-4 sm:grid-cols-2">
 <Field label="Team"><select className={control} value={teamId} onChange={e=>setTeam(e.target.value)}>{teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
 <Field label="Request type"><select className={control} value={type} onChange={e=>{const next=e.target.value as TicketType;setType(next);setFields(next==='purchase_request'?{currency:'INR'}:{});}}>{Object.entries(typeLabels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></Field>
 <Field label="Title"><input required maxLength={200} className={control} value={title} onChange={e=>setTitle(e.target.value)}/></Field>
 <Field label="Priority"><select className={control} value={priority} onChange={e=>setPriority(e.target.value)}>{['low','medium','high'].map(p=><option key={p}>{p}</option>)}</select></Field>
 <div className="sm:col-span-2"><Field label="Description"><textarea required rows={3} maxLength={10000} className={control} value={description} onChange={e=>setDescription(e.target.value)}/></Field></div>
 <RequestFields type={type} fields={fields} setFields={setFields}/>
 </fieldset>
 {(type==='access_request'||type==='purchase_request')&&<p className="text-sm text-muted-foreground">Support will select an independent approver before fulfillment.</p>}
 {save.error&&<ErrorNotice message={save.error.message}/>}
 <div className="flex gap-2"><button className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50" disabled={save.isPending}>Submit request</button><button type="button" className={actionClass} disabled={save.isPending} onClick={onClose}>Cancel</button></div>
 </form></section>;
}
