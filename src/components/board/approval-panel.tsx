"use client";

import {useEffect,useRef,useState} from "react";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {Button} from "@/components/ui/button";

import type {ApprovalDetails as Details} from "@/types/approvals";
import {createClient} from "@/lib/supabase/client";
const labels:Record<string,string>={not_requested:"Not requested",pending:"Pending review",changes_requested:"Changes requested",approved:"Approved"};
export function tomorrowInZone(timezone:string){
 const parts=new Intl.DateTimeFormat("en-CA",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
 const value=(key:string)=>parts.find(p=>p.type===key)!.value;
 const date=new Date(`${value("year")}-${value("month")}-${value("day")}T12:00:00Z`);date.setUTCDate(date.getUTCDate()+1);return date.toISOString().slice(0,10);
}
async function responseData(response:Response):Promise<Details>{const body=await response.json();if(!response.ok)throw new Error(typeof body.error==="string"?body.error:"Unable to update approval. Try again.");return body;}
export function ApprovalPanel({cardId,boardId}:{cardId:string;boardId:string}){
 const client=useQueryClient();const key=["approval",cardId];
 const [validAccount,setValidAccount]=useState(true);const account=useRef<string|null>(null);
 const details=useQuery({queryKey:key,enabled:validAccount,queryFn:async({signal})=>{const data=await responseData(await fetch(`/api/cards/${cardId}/approval`,{signal,cache:"no-store"}));account.current=data.current_user_id;return data;},gcTime:0,refetchInterval:30_000});
 const [reviewer,setReviewer]=useState("");const [due,setDue]=useState("");const [note,setNote]=useState("");const [busy,setBusy]=useState(false);const [error,setError]=useState("");
 const pending=useRef<Record<string,unknown>|null>(null);const lifetime=useRef<AbortController|null>(null);
 useEffect(()=>{const controller=new AbortController();lifetime.current=controller;const {data:{subscription}}=createClient().auth.onAuthStateChange((_event,session)=>{if(!account.current&&session?.user.id){account.current=session.user.id;return;}if(session?.user.id===account.current)return;controller.abort();setValidAccount(false);void client.cancelQueries({queryKey:["approval",cardId]}).then(()=>client.removeQueries({queryKey:["approval",cardId]}));});return()=>{controller.abort();subscription.unsubscribe();};},[cardId,client]);
 async function send(payload:Record<string,unknown>){
  const controller=lifetime.current;if(!controller||controller.signal.aborted)return;
  pending.current=payload;setBusy(true);setError("");
  try{const response=await fetch(`/api/cards/${cardId}/approval`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload),signal:controller.signal});if(!response.ok)pending.current=null;if(response.status===409){await details.refetch();if(controller.signal.aborted)return;}const data=await responseData(response);
   if(controller.signal.aborted)return;pending.current=null;setNote("");client.setQueryData(key,data);
   await Promise.all([client.invalidateQueries({predicate:query=>query.queryKey[0]==="my-work"&&query.queryKey[2]==="list"}),client.invalidateQueries({queryKey:["board",boardId]})]);
  }catch(err){if(!controller.signal.aborted)setError(err instanceof Error?err.message:"Unable to update approval. Try again.");}finally{if(!controller.signal.aborted)setBusy(false);}
 }
 function action(action:string,extra:Record<string,unknown>={}){void send({action,operationId:crypto.randomUUID(),expectedRevision:details.data!.revision,...extra});}
 const data=details.data;
 if(!validAccount)return <p role="status">Updating your session…</p>;
 if(!data)return <section aria-label="Approval" className="rounded-lg border border-border p-3">{details.isError?<><p role="alert">Unable to load approval.</p><Button type="button" variant="outline" onClick={()=>void details.refetch()}>Retry approval</Button></>:<p role="status">Loading approval…</p>}</section>;
 const deadline=due||tomorrowInZone(data.timezone||"UTC");
 return <section aria-label="Approval" className="space-y-3 rounded-lg border border-border p-3 text-sm">
  <div className="flex flex-wrap justify-between gap-2"><h3 className="font-medium">Approval</h3><span>{data.required?labels[data.status]||data.status:"Not required"}</span></div>
  {data.current_request&&<p>Reviewer: {data.current_request.reviewer_name||"Named reviewer"}. Review due {data.current_request.review_due_date} ({data.current_request.review_timezone}, fixed for this request).</p>}
  {data.required&&!data.current_request&&<p className="text-muted-foreground">Reviewer: {data.eligible_reviewers.find(p=>p.id===data.reviewer_id)?.full_name||"Configured reviewer"}. Approval unlocks completion; complete the task when ready.</p>}
  {data.required&&data.eligible_reviewers.length===0&&<p className="text-muted-foreground">No independent reviewer is currently eligible. The board owner must choose a member with access who is neither requester nor assignee.</p>}
  {data.can_configure&&<div className="flex flex-wrap items-end gap-2"><label className="flex flex-col gap-1">Reviewer<select aria-label="Approval reviewer" value={reviewer||data.reviewer_id||""} onChange={e=>setReviewer(e.target.value)} className="rounded-md border border-input bg-background p-2"><option value="">Choose independent reviewer</option>{data.eligible_reviewers.map(p=><option key={p.id} value={p.id}>{p.full_name||p.id}</option>)}</select></label><Button type="button" size="sm" variant="outline" disabled={busy||!(reviewer||data.reviewer_id)} onClick={()=>action("configure",{required:true,reviewerId:reviewer||data.reviewer_id})}>{data.required?"Save reviewer":"Require approval"}</Button>{data.required&&<Button type="button" size="sm" variant="outline" disabled={busy||!note.trim()} onClick={()=>action("configure",{required:false,reviewerId:data.reviewer_id,reason:note.trim()})}>Disable approval</Button>}</div>}
  {(data.can_decide||data.can_configure||data.can_request)&&<label className="block">Decision note / reason<textarea aria-label="Approval note" value={note} maxLength={2000} onChange={e=>setNote(e.target.value)} className="mt-1 min-h-16 w-full rounded-md border border-input bg-background p-2"/><span className="text-xs text-muted-foreground">Required for changes or disabling approval. {note.length}/2000</span></label>}
  {data.required&&data.can_request&&data.status!=="pending"&&<div className="flex flex-wrap items-end gap-2"><label className="flex flex-col gap-1">Review deadline ({data.timezone})<input aria-label="Review deadline" type="date" required value={deadline} onChange={e=>setDue(e.target.value)} className="rounded-md border border-input bg-background p-2"/></label><Button type="button" size="sm" disabled={busy||!deadline||!data.reviewer_id} onClick={()=>action("request",{reviewDueDate:deadline})}>Request review</Button></div>}
  <div className="flex flex-wrap gap-2">{data.status==="pending"&&data.can_withdraw&&data.current_request&&<Button type="button" size="sm" variant="outline" disabled={busy} onClick={()=>action("withdraw",{requestId:data.current_request!.id,note:note.trim()||undefined})}>Withdraw request</Button>}{data.can_decide&&data.current_request&&<><Button type="button" size="sm" disabled={busy} onClick={()=>action("approve",{requestId:data.current_request!.id,note:note.trim()||undefined})}>Approve</Button><Button type="button" size="sm" variant="outline" disabled={busy||!note.trim()} onClick={()=>action("request_changes",{requestId:data.current_request!.id,note:note.trim()})}>Request changes</Button></>}</div>
  {error&&<div role="alert"><p>{error}</p>{pending.current?<Button type="button" variant="outline" size="sm" disabled={busy} onClick={()=>pending.current&&void send(pending.current)}>Retry action</Button>:<Button type="button" variant="outline" size="sm" onClick={()=>void details.refetch()}>Refresh approval</Button>}</div>}
  {data.history.length>0&&<details><summary className="cursor-pointer">Approval history</summary><ol className="mt-2 space-y-2">{[...data.history].sort((a,b)=>a.created_at.localeCompare(b.created_at)).map(entry=><li key={entry.id}><p>{entry.action.replaceAll("_"," ")} · {entry.actor_name||"Member"} · {new Date(entry.created_at).toLocaleString()}</p>{entry.note&&<p className="whitespace-pre-wrap break-words text-muted-foreground">{entry.note}</p>}</li>)}</ol></details>}
 </section>;
}
