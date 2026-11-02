"use client";
import {useEffect,useRef,useState} from "react";
import {Button} from "@/components/ui/button";
import {Dialog,DialogContent,DialogHeader,DialogTitle} from "@/components/ui/dialog";
interface Workflow {settings:{scheduling_enabled:boolean;timezone:string};health:{pending:number;failed:number;disabled:number;needsReview:number;accepted:number}}
export function WorkflowSettingsDialog({boardId,open,onOpenChange}:{boardId:string;open:boolean;onOpenChange:(value:boolean)=>void}){
 const [data,setData]=useState<Workflow|null>(null);const [enabled,setEnabled]=useState(false);const [timezone,setTimezone]=useState("UTC");const [error,setError]=useState("");const [busy,setBusy]=useState(false);const controller=useRef<AbortController|null>(null);
 const hydrated=useRef(false);
 const browserZone=Intl.DateTimeFormat().resolvedOptions().timeZone||"UTC";
 async function load(action?:"save"|"retry_failed"){
  const current=controller.current;if(!current||current.signal.aborted)return;setBusy(true);setError("");
  try{const res=await fetch(`/api/boards/${boardId}/workflow`,{signal:current.signal,cache:"no-store",...(action?{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,...(action==="save"?{scheduling_enabled:enabled,timezone}: {})})}:{})});const body=await res.json();if(!res.ok)throw new Error(typeof body.error==="string"?body.error:"Unable to load workflow settings.");if(current.signal.aborted)return;setData(body);if(action==="save"||!hydrated.current){setEnabled(body.settings.scheduling_enabled);setTimezone(body.settings.timezone);hydrated.current=true;}
  }catch(err){if(!current.signal.aborted)setError(err instanceof Error?err.message:"Unable to update settings.");}finally{if(!current.signal.aborted)setBusy(false);}
 }
 useEffect(()=>{if(!open)return;const current=new AbortController();controller.current=current;hydrated.current=false;void load();return()=>current.abort();
 // Settings load once for each dialog lifetime; drafts survive other refreshes.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[open,boardId]);
 return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>Workflow notifications</DialogTitle></DialogHeader>
  {error&&<div role="alert"><p>{error}</p><Button variant="outline" onClick={()=>void load()}>Retry loading</Button></div>}
  {!data&&!error&&<p role="status">Loading workflow settings…</p>}
  {data&&<div className="space-y-4 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/>Scheduled reminders and escalation</label><p className="text-muted-foreground">Notify assignees and reviewers on deadlines. Escalate to the board owner after one full overdue day. Approvals also work with scheduling disabled.</p>
   <label className="block">Board timezone<input aria-label="Board timezone" value={timezone} onChange={e=>setTimezone(e.target.value)} className="mt-1 w-full rounded-md border border-input bg-background p-2"/></label>
   {enabled&&timezone!==browserZone&&<Button variant="outline" onClick={()=>setTimezone(browserZone)}>Use browser timezone ({browserZone})</Button>}
   <p className="text-xs text-muted-foreground">Existing review deadlines keep their original timezone.</p><Button disabled={busy||!timezone.trim()} onClick={()=>void load("save")}>Save workflow settings</Button>
   <section aria-label="Delivery health" className="space-y-2 border-t border-border pt-3"><h3 className="font-medium">Delivery health</h3><dl className="grid grid-cols-2 gap-2">{([["Pending",data.health.pending],["Failed",data.health.failed],["Disabled / unconfigured",data.health.disabled],["Needs inspection",data.health.needsReview],["Provider accepted",data.health.accepted]] as const).map(([label,count])=><div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="font-medium">{count}</dd></div>)}</dl><p className="text-xs text-muted-foreground">Provider acceptance does not confirm inbox delivery. Jobs needing inspection cannot be resent blindly.</p><Button variant="outline" disabled={busy||data.health.failed===0} onClick={()=>void load("retry_failed")}>Retry eligible failures</Button><Button variant="ghost" disabled={busy} onClick={()=>void load()}>Refresh health</Button></section>
  </div>}
 </DialogContent></Dialog>;
}
