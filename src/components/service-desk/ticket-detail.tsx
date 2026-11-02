"use client";
import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { deskLabel, ticketReference, typeLabels, type DeskDetail } from '@/types/service-desk';
import { actionClass, control, deskRead, ErrorNotice, Field, RequestFields, useDeskAccount, useDeskGuard, useDeskMutation } from './shared';
import { TicketControls } from './ticket-controls';
import { LinkedTasks } from './ticket-links';
export function TicketDetail({userId,ticketId}:{userId:string;ticketId:string}){
 const valid=useDeskAccount(userId);return valid?<DetailContent key={`${userId}:${ticketId}`} userId={userId} ticketId={ticketId}/>:<p role="status" className="p-6">Updating your session…</p>;
}
function DetailContent({userId,ticketId}:{userId:string;ticketId:string}){
 const detail=useQuery({queryKey:['service-desk',userId,'ticket',ticketId],queryFn:({signal})=>deskRead<DeskDetail>(`/api/service-desk/tickets/${ticketId}`,signal),gcTime:0,retry:false,refetchOnWindowFocus:'always',refetchInterval:30000});
 return <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6 md:py-8"><Link href="/dashboard/service-desk" className="mb-5 ml-12 inline-block text-sm text-primary underline md:ml-0">Back to Service Desk</Link>
 {detail.isPending&&<p role="status">Loading ticket…</p>}{detail.error&&<ErrorNotice message={detail.error.message} retry={()=>void detail.refetch()}/>}
 {detail.data&&!detail.error&&<TicketBody key={ticketId} userId={userId} detail={detail.data}/>}</div>;
}
function TicketBody({userId,detail}:{userId:string;detail:DeskDetail}){
 const {ticket:t,team}=detail;const [comment,setComment]=useState('');const [editing,setEditing]=useState(false);
 const mutation=useDeskMutation(userId,`/api/service-desk/tickets/${t.id}/actions`,()=>setComment(''));
 const person=(id:string|null)=>team.members.find(m=>m.id===id)?.name??(id?'Former team member':'Unassigned');
 const mayEdit=(team.support||t.requester_id===userId)&&['submitted','triage','waiting'].includes(t.status)&&!t.work_started;
 return <>
 <header className="mb-6 pr-8"><p className="text-sm text-muted-foreground">{ticketReference(t.number)} · {team.name} · {typeLabels[t.type]}</p><h1 className="mt-1 break-words text-2xl font-bold">{t.title}</h1><div className="mt-3 flex flex-wrap gap-2 text-xs">{[deskLabel(t.status),`${deskLabel(t.priority)} priority`,`Approval: ${deskLabel(t.approval_status)}`].map(s=><span key={s} className="rounded-md bg-muted px-2 py-1">{s}</span>)}</div></header>
 <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
 <div className="min-w-0 space-y-6">
 <section className="space-y-4 rounded-xl border border-border p-4"><div className="flex items-center justify-between gap-2"><h2 className="font-semibold">Request details</h2>{mayEdit&&<button type="button" className={actionClass} onClick={()=>setEditing(!editing)}>{editing?'Cancel edit':'Edit request'}</button>}</div>
 {editing?<EditRequest key={`${t.id}:${t.revision}`} userId={userId} detail={detail} done={()=>setEditing(false)}/>:<><p className="whitespace-pre-wrap break-words text-sm">{t.description}</p><dl className="grid gap-3 text-sm sm:grid-cols-2">{Object.entries(t.fields).map(([key,value])=><div key={key}><dt className="text-muted-foreground">{deskLabel(key)}</dt><dd className="whitespace-pre-wrap break-words">{value}</dd></div>)}</dl></>}
 <dl className="grid gap-3 border-t border-border pt-4 text-sm sm:grid-cols-2"><div><dt className="text-muted-foreground">Requester</dt><dd>{person(t.requester_id)}</dd></div><div><dt className="text-muted-foreground">Assigned to</dt><dd>{person(t.assignee_id)}</dd></div><div><dt className="text-muted-foreground">Due date</dt><dd>{t.due_date??'No due date'}</dd></div><div><dt className="text-muted-foreground">Approver</dt><dd>{person(t.approver_id)}</dd></div></dl>
 {t.waiting_reason&&<p className="text-sm">Waiting for: {deskLabel(t.waiting_reason)}</p>}{t.resolution_note&&<p className="whitespace-pre-wrap break-words rounded bg-muted p-3 text-sm"><strong>Resolution: </strong>{t.resolution_note}</p>}
 </section>
 <section className="space-y-3 rounded-xl border border-border p-4"><h2 className="font-semibold">Attachments</h2><p className="text-xs text-muted-foreground">Files up to 10 MB. Adding a file changes the request and requires fresh approval.</p>
 {detail.attachments.length===0?<p className="text-sm text-muted-foreground">No attachments.</p>:<ul className="space-y-2">{detail.attachments.map(a=><li key={a.id}><a className="break-all text-sm text-primary underline" href={`/api/service-desk/tickets/${t.id}/attachments/${a.id}`}>{a.file_name}</a><span className="ml-2 text-xs text-muted-foreground">{Math.ceil(a.file_size/1024)} KB</span></li>)}</ul>}
 {mayEdit&&<UploadAttachment userId={userId} detail={detail}/>}</section>
 <LinkedTasks userId={userId} detail={detail}/>
 <section className="space-y-4 rounded-xl border border-border p-4"><h2 className="font-semibold">Conversation</h2><p className="text-xs text-muted-foreground">Comments are visible to the requester, support staff, and the assigned approver.</p>
 {detail.comments.length===0?<p className="text-sm text-muted-foreground">No comments yet.</p>:<ul className="space-y-3">{detail.comments.map(c=><li key={c.id} className="rounded-md bg-muted/50 p-3"><p className="mb-1 text-xs text-muted-foreground">{person(c.author_id)} · {new Date(c.created_at).toLocaleString()}</p><p className="whitespace-pre-wrap break-words text-sm">{c.text}</p></li>)}</ul>}
 {!['closed','cancelled'].includes(t.status)&&<form className="space-y-3" onSubmit={e=>{e.preventDefault();mutation.mutate({action:'comment',text:comment,expectedRevision:t.revision});}}><Field label="Add a comment"><textarea className={control} required maxLength={5000} value={comment} onChange={e=>setComment(e.target.value)}/></Field>{mutation.error&&<ErrorNotice message={mutation.error.message}/>}<button className={actionClass} disabled={mutation.isPending}>Post comment</button></form>}</section>
 <section className="rounded-xl border border-border p-4"><h2 className="mb-3 font-semibold">Approval history</h2>{detail.approvals.length===0?<p className="text-sm text-muted-foreground">No approval requested.</p>:<ul className="space-y-3 text-sm">{detail.approvals.map(a=><li key={a.id} className="border-l-2 border-border pl-3"><p>{person(a.approver_id)} · {deskLabel(a.status)} · Revision {a.revision}</p><p className="text-xs text-muted-foreground">Requested {new Date(a.requested_at).toLocaleString()}</p>{a.note&&<p className="mt-1 whitespace-pre-wrap break-words">{a.note}</p>}</li>)}</ul>}</section>
 <section className="rounded-xl border border-border p-4"><h2 className="mb-3 font-semibold">Activity</h2><ol className="space-y-3 text-sm">{detail.activity.map(a=><li key={a.id} className="border-l-2 border-border pl-3"><p>{person(a.actor_id)} · {deskLabel(a.action)}{a.details.status?` → ${deskLabel(String(a.details.status))}`:''}</p>{typeof a.details.note==='string'&&<p className="whitespace-pre-wrap break-words">{a.details.note}</p>}<p className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString()}</p></li>)}</ol></section>
 </div><aside className="min-w-0"><TicketControls userId={userId} detail={detail}/></aside>
 </div></>;
}
function EditRequest({userId,detail,done}:{userId:string;detail:DeskDetail;done:()=>void}){
 const t=detail.ticket;const [title,setTitle]=useState(t.title);const [description,setDescription]=useState(t.description);const [fields,setFields]=useState(t.fields);
 const save=useDeskMutation(userId,`/api/service-desk/tickets/${t.id}/actions`,done);
 return <form className="space-y-4" onSubmit={e=>{e.preventDefault();save.mutate({action:'edit',expectedRevision:t.revision,title,description,fields});}}><fieldset disabled={save.isPending} className="space-y-4"><Field label="Edit title"><input className={control} required maxLength={200} value={title} onChange={e=>setTitle(e.target.value)}/></Field><Field label="Edit description"><textarea className={control} required maxLength={10000} value={description} onChange={e=>setDescription(e.target.value)}/></Field><RequestFields type={t.type} fields={fields} setFields={setFields}/></fieldset><p className="text-xs text-muted-foreground">Material changes invalidate pending or approved review.</p>{save.error&&<ErrorNotice message={save.error.message}/>}<button className={actionClass} disabled={save.isPending}>Save request</button></form>;
}
function UploadAttachment({userId,detail}:{userId:string;detail:DeskDetail}){
 const t=detail.ticket;const client=useQueryClient();const guard=useDeskGuard(userId);const [file,setFile]=useState<File|null>(null);const [error,setError]=useState('');const [pending,setPending]=useState(false);const [operationId,setOperation]=useState(()=>crypto.randomUUID());
 return <form className="space-y-3" onSubmit={async e=>{e.preventDefault();if(!file)return;if(file.size<1||file.size>10485760){setError('Choose a nonempty file up to 10 MB');return;}setPending(true);setError('');
  const form=new FormData();form.set('file',file);form.set('operationId',operationId);form.set('expectedRevision',String(t.revision));
  try{const res=await fetch(`/api/service-desk/tickets/${t.id}/attachments`,{method:'POST',body:form,signal:guard.current.controller.signal});const body=await res.json();if(!guard.current.active)return;if(!res.ok)throw new Error(body.error||'Unable to upload file');setFile(null);setOperation(crypto.randomUUID());await client.invalidateQueries({queryKey:['service-desk',userId]});}catch(err){if(guard.current.active)setError(err instanceof Error?err.message:'Unable to upload file');}finally{if(guard.current.active)setPending(false);}
 }}><Field label="Attach a file"><input className={control} disabled={pending} type="file" onChange={e=>{setFile(e.target.files?.[0]??null);setOperation(crypto.randomUUID());}}/></Field>{error&&<ErrorNotice message={error}/>}<button className={actionClass} disabled={pending||!file}>Upload attachment</button></form>;
}
