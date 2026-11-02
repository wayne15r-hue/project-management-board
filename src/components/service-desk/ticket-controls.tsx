"use client";
import { useState } from 'react';
import { deskLabel, type DeskDetail, type TicketStatus } from '@/types/service-desk';
import { actionClass, control, ErrorNotice, Field, useDeskMutation } from './shared';
const transitions:Record<TicketStatus,TicketStatus[]>={submitted:['triage','waiting','cancelled'],triage:['in_progress','waiting','cancelled'],waiting:['triage','in_progress','cancelled'],in_progress:['triage','waiting','resolved','cancelled'],resolved:['closed','triage'],closed:['triage'],cancelled:[]};
export function TicketControls({userId,detail}:{userId:string;detail:DeskDetail}){
 const t=detail.ticket;const support=detail.team.support;const requester=t.requester_id===userId;
 const save=useDeskMutation(userId,`/api/service-desk/tickets/${t.id}/actions`);
 const [next,setNext]=useState('');const [note,setNote]=useState('');const [waiting,setWaiting]=useState('requester_information');const [approver,setApprover]=useState('');const [decisionNote,setDecisionNote]=useState('');
 const send=(body:Record<string,unknown>)=>save.mutate({expectedRevision:t.revision,...body});
 const available=transitions[t.status].filter(s=>support||(requester&&(s==='cancelled'||(s==='closed'&&t.status==='resolved')||(s==='triage'&&['resolved','closed'].includes(t.status)))));
 const staff=detail.team.members.filter(m=>m.support);const reviewers=detail.team.members.filter(m=>m.id!==t.requester_id&&m.id!==t.assignee_id);
 const approvalRequired=['access_request','purchase_request'].includes(t.type);
 return <section className="space-y-5 rounded-xl border border-border p-4"><h2 className="font-semibold">Ticket actions</h2>
 {save.error&&<ErrorNotice message={save.error.message}/>}
 <fieldset disabled={save.isPending} className="space-y-5">
 {support&&<>
 <Field label="Assign support"><select className={control} value={t.assignee_id??''} onChange={e=>send({action:'assign',assigneeId:e.target.value||null})}><option value="">Unassigned</option>{t.assignee_id&&!staff.some(m=>m.id===t.assignee_id)&&<option value={t.assignee_id}>Unavailable — select replacement</option>}{staff.filter(m=>m.id!==t.approver_id).map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
 <Field label="Update priority"><select className={control} value={t.priority} onChange={e=>send({action:'manage',priority:e.target.value})}>{['low','medium','high'].map(p=><option key={p} value={p}>{deskLabel(p)}</option>)}</select></Field>
 <Field label="Update due date"><input key={t.due_date??'none'} type="date" className={control} defaultValue={t.due_date??''} onBlur={e=>{if((e.target.value||null)!==t.due_date)send({action:'manage',dueDate:e.target.value||null});}}/></Field>
 </>}
 {available.length>0&&<form className="space-y-3 border-t border-border pt-4" onSubmit={e=>{e.preventDefault();send({action:'status',status:next,...(note.trim()?{note}:{}),...(next==='waiting'?{waitingReason:waiting}:{})});}}>
 <Field label="Next status"><select required className={control} value={available.includes(next as TicketStatus)?next:''} onChange={e=>setNext(e.target.value)}><option value="">Choose status</option>{available.map(s=><option key={s} value={s}>{s==='triage'&&['closed','resolved'].includes(t.status)?'Reopen in triage':deskLabel(s)}</option>)}</select></Field>
 {next==='waiting'&&<Field label="Waiting for"><select className={control} value={waiting} onChange={e=>setWaiting(e.target.value)}><option value="requester_information">Requester information</option>{t.approval_status==='pending'&&<option value="approval">Approval</option>}</select></Field>}
 <Field label="Reason or resolution note"><textarea className={control} maxLength={5000} value={note} onChange={e=>setNote(e.target.value)} required={next==='waiting'||next==='resolved'||(next==='triage'&&(t.work_started||['closed','resolved','in_progress'].includes(t.status)))}/></Field><button className={actionClass}>Update status</button></form>}
 {(approvalRequired||t.approver_id)&&<p className="text-xs text-muted-foreground">An independent approval is required before work starts. Approval does not close the ticket.</p>}
 {support&&['submitted','triage','waiting'].includes(t.status)&&<form className="space-y-3 border-t border-border pt-4" onSubmit={e=>{e.preventDefault();send({action:'request_approval',approverId:approver});}}><Field label="Select approver"><select required className={control} value={approver} onChange={e=>setApprover(e.target.value)}><option value="">Choose teammate</option>{reviewers.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></Field><button className={actionClass}>Request approval</button>{reviewers.length===0&&<p className="text-xs text-muted-foreground">Add an independent teammate before requesting approval.</p>}</form>}
 {t.approver_id===userId&&t.approval_status==='pending'&&<div className="space-y-3 border-t border-border pt-4"><p className="text-sm font-medium">Your review is requested</p><Field label="Decision note"><textarea className={control} maxLength={5000} value={decisionNote} onChange={e=>setDecisionNote(e.target.value)}/></Field><div className="flex flex-wrap gap-2"><button type="button" className={actionClass} onClick={()=>send({action:'approve',...(decisionNote.trim()?{note:decisionNote}:{})})}>Approve</button><button type="button" className={actionClass} disabled={!decisionNote.trim()} onClick={()=>send({action:'request_changes',note:decisionNote})}>Request changes</button><button type="button" className={actionClass} disabled={!decisionNote.trim()} onClick={()=>send({action:'reject',note:decisionNote})}>Reject</button></div><p className="text-xs text-muted-foreground">Changes requested and rejection require a reason.</p></div>}
 </fieldset>{save.isPending&&<p role="status" className="text-sm text-muted-foreground">Saving…</p>}
 </section>;
}
