'use client';
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { accountSelectClass } from './directory-form';
import type { AccountAction, AccountOperation, AccountPerson, DeletionPreview } from '@/types/accounts';

export async function accountRead<T>(url:string,init?:RequestInit):Promise<T> {
  const response=await fetch(url,{cache:'no-store',...init});const data=await response.json();
  if(!response.ok)throw new Error(data.error??'Unable to load account administration');
  return data;
}
export function accountDate(value:string|null) { return value?new Date(value).toLocaleString():'Unavailable'; }
function ResetEmailButton({requestedAt,disabled,onClick}:{requestedAt:string|null;disabled:boolean;onClick:()=>void}) {
  const until=requestedAt?new Date(requestedAt).getTime()+60000:0;
  const [cooling,setCooling]=useState(()=>until>Date.now());
  useEffect(()=>{const timer=setTimeout(()=>setCooling(false),Math.max(0,until-Date.now()));return()=>clearTimeout(timer);},[until]);
  return <div className="space-y-1"><Button variant="outline" disabled={disabled||cooling} onClick={onClick}>Send password reset email</Button>{cooling&&<p className="text-xs text-muted-foreground">Wait 60 seconds after the previous reset request before requesting another.</p>}</div>;
}
function outcome(operation:AccountOperation) {
  if(operation.status==='pending')return operation.attempts>0?'Queued for retry.':'Queued. Processing has not completed.';
  if(operation.status==='running')return 'Running. Processing has not completed.';
  if(operation.status==='ambiguous')return 'Outcome uncertain. Check the audit log before making another request. Password reset requests are not automatically replayed.';
  if(operation.status==='failed')return 'Failed. Review the error before retrying.';
  return operation.action==='reset_password'?'Reset email request accepted by the provider. Delivery is not confirmed.':'Completed.';
}
export function AccountControls({person,viewerId,owner}:{person:AccountPerson;viewerId:string;owner:boolean}) {
  const cache=useQueryClient();
  const [confirm,setConfirm]=useState<'deactivate'|'reactivate'|null>(null);
  const [preview,setPreview]=useState<DeletionPreview|null>(null);
  const [email,setEmail]=useState('');const [transfers,setTransfers]=useState<Record<string,string|null>>({});
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const polls=useRef({id:'',count:0});
  const operationKey=['employee-admin','operation',person.id];
  const operation=useQuery({queryKey:operationKey,initialData:person.latestOperation??undefined,queryFn:async()=>{
    polls.current.count++;
    const data=await accountRead<AccountOperation|null>(`/api/admin/accounts/${person.id}/operations`);
    if(data&&polls.current.id!==data.id)polls.current={id:data.id,count:1};
    return data;
  },refetchInterval:q=>q.state.data&&['pending','running'].includes(q.state.data.status)&&(polls.current.id!==q.state.data.id||polls.current.count<13)?5000:false,
    retry:false,refetchOnWindowFocus:false});
  const pending=operation.data?.status==='pending'||operation.data?.status==='running';
  const protectedTarget=person.id===viewerId||person.adminRole==='owner';
  const destructiveAllowed=!protectedTarget&&(owner||(!person.adminRole&&!person.account.formerAdmin));
  const inactive=person.account.status!=='active';
  const unavailable=person.account.status==='deleted'||person.account.status==='deleting';
  async function request(action:AccountAction,body:Record<string,unknown>,operationId=crypto.randomUUID()) {
    if(busy)return;setBusy(true);setError('');
    try {
      const route=action==='reset_password'?'reset-password':action==='delete'?'delete':'status';
      const data=await accountRead<AccountOperation>(`/api/admin/accounts/${person.id}/${route}`,{method:route==='status'?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operationId,...body,...(route==='status'?{action}:{})})});
      cache.setQueryData(operationKey,data);setConfirm(null);setPreview(null);
      await cache.invalidateQueries({queryKey:['employee-admin','directory']});
    } catch(e){setError(e instanceof Error?e.message:'Could not request account action');}
    finally{setBusy(false);}
  }
  async function retryCleanup() {
    if(!operation.data||busy)return;setBusy(true);setError('');
    try{const data=await accountRead<AccountOperation>(`/api/admin/accounts/${person.id}/operations`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operationId:operation.data.id})});polls.current={id:data.id,count:0};cache.setQueryData(operationKey,data);await cache.invalidateQueries({queryKey:['employee-admin','directory']});}
    catch(e){setError(e instanceof Error?e.message:'Could not retry cleanup');}finally{setBusy(false);}
  }
  async function loadPreview() {
    setBusy(true);setError('');
    try {const data=await accountRead<DeletionPreview>(`/api/admin/accounts/${person.id}/deletion-preview`);setPreview(data);setTransfers({});setEmail('');setConfirm(null);}
    catch(e){setError(e instanceof Error?e.message:'Could not preview deletion');}finally{setBusy(false);}
  }
  const ready=preview&&preview.blockers.length===0&&!preview.requirements.some(r=>r.blockedReason||(!(r.key in transfers))||(!r.allowNone&&!transfers[r.key])||(transfers[r.key]&&!r.candidates.some(c=>c.id===transfers[r.key])))&&email===preview.confirmationEmail;
  return <div className="w-full space-y-3">
    <div className="flex flex-wrap gap-2">
      {!unavailable&&<ResetEmailButton key={operation.data?.action==='reset_password'?operation.data.created_at:'no-reset'} requestedAt={operation.data?.action==='reset_password'?operation.data.created_at:null} disabled={busy||pending||inactive} onClick={()=>void request('reset_password',{})}/>}
      {destructiveAllowed&&!unavailable&&<Button variant="outline" disabled={busy||pending} onClick={()=>{setConfirm(inactive?'reactivate':'deactivate');setPreview(null);setError('');}}>{inactive?'Reactivate account':'Deactivate account'}</Button>}
      {destructiveAllowed&&person.account.status!=='deleted'&&<Button variant="outline" disabled={busy||pending} onClick={()=>void loadPreview()}>{person.account.status==='deleting'?'Resume deletion':'Delete account'}</Button>}
    </div>
    {protectedTarget&&<p className="text-xs text-muted-foreground">Your own account and the Admin Team owner cannot be deactivated or deleted.</p>}
    {!protectedTarget&&!destructiveAllowed&&<p className="text-xs text-muted-foreground">Only the owner can deactivate or delete current or former admins.</p>}
    {confirm&&<section className="space-y-3 rounded-lg border p-4" aria-label="Confirm account status change"><p className="text-sm">{confirm==='deactivate'?'Deactivate this account? Access will be blocked immediately. Shared work and history are preserved.':'Reactivate this account? Access is restored only after the provider confirms activation. Former admin access is not automatically restored.'}</p><div className="flex flex-wrap gap-2"><Button disabled={busy||pending} onClick={()=>void request(confirm,{expectedRevision:person.account.revision})}>{confirm==='deactivate'?'Confirm deactivation':'Confirm reactivation'}</Button><Button variant="ghost" disabled={busy} onClick={()=>setConfirm(null)}>Cancel status change</Button></div></section>}
    {preview&&<section aria-label="Delete account review" className="space-y-4 rounded-lg border border-destructive/40 p-4">
      <h3 className="font-semibold">Review permanent account deletion</h3>
      <p className="text-sm">This permanently removes sign-in access and employment details. Shared work, files and historical attribution are preserved. Choose eligible successors below. Private work content is not shown.</p>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">{Object.entries(preview.counts).map(([key,count])=><div key={key}><dt className="text-muted-foreground break-words">{key.replace(/([A-Z])/g,' $1').replaceAll('_',' ')}</dt><dd>{count}</dd></div>)}</dl>
      {preview.blockers.length>0&&<ul className="list-disc pl-5 text-sm text-destructive">{preview.blockers.map((blocker,i)=><li key={i}>{blocker}</li>)}</ul>}
      {preview.requirements.map((requirement,index)=><div className="space-y-2" key={requirement.key}>
        <Label htmlFor={`transfer-${person.id}-${index}`}>Transfer {requirement.label}</Label><p className="text-xs text-muted-foreground">{requirement.count} {requirement.kind} item(s)</p>
        <select className={accountSelectClass} id={`transfer-${person.id}-${index}`} disabled={busy||!!requirement.blockedReason} value={requirement.key in transfers?transfers[requirement.key]??'none':''} onChange={e=>setTransfers({...transfers,[requirement.key]:e.target.value==='none'?null:e.target.value})}>
          <option value="" disabled>Choose an eligible successor</option>{requirement.allowNone&&<option value="none">No successor required</option>}{requirement.candidates.map(candidate=><option key={candidate.id} value={candidate.id}>{candidate.full_name??candidate.email} ({candidate.email})</option>)}
        </select>{requirement.blockedReason&&<p className="text-sm text-destructive">{requirement.blockedReason}</p>}
      </div>)}
      <p className="text-sm break-all">Auth email: {preview.confirmationEmail}</p><Label htmlFor={`delete-email-${person.id}`}>Type the Auth email to confirm</Label><Input id={`delete-email-${person.id}`} type="email" autoComplete="off" value={email} disabled={busy} onChange={e=>setEmail(e.target.value)}/>
      <div className="flex flex-wrap gap-2"><Button variant="destructive" disabled={!ready||busy||pending} onClick={()=>void request('delete',{expectedRevision:preview.revision,confirmationEmail:email,transfers})}>Permanently delete account</Button><Button variant="outline" disabled={busy} onClick={()=>void loadPreview()}>Refresh deletion preview</Button><Button variant="ghost" disabled={busy} onClick={()=>setPreview(null)}>Cancel deletion</Button></div>
    </section>}
    {operation.data&&<div className="space-y-2 rounded-md bg-muted/50 p-3 text-sm"><p className="font-medium">Latest action: {operation.data.action.replaceAll('_',' ')}</p><p role="status">{outcome(operation.data)}</p>{operation.data.last_error&&<p className="text-destructive">{operation.data.last_error}</p>}
      <Button variant="outline" disabled={operation.isFetching||busy} onClick={()=>{void operation.refetch();void cache.invalidateQueries({queryKey:['employee-admin','directory']});}}>Refresh operation status</Button>
      {operation.data.status==='failed'&&operation.data.action!=='reset_password'&&operation.data.actor_id===viewerId&&destructiveAllowed&&<Button variant="outline" disabled={busy} onClick={()=>void retryCleanup()}>Retry cleanup</Button>}
      {pending&&<p className="text-xs text-muted-foreground">Status refreshes for up to one minute. Refresh manually if processing continues.</p>}
    </div>}
    {operation.error&&<p role="alert" className="text-sm text-destructive">{operation.error.message}</p>}
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}
