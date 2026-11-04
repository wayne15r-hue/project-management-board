"use client";

import {createContext,useCallback,useContext,useEffect,useRef,useState} from 'react';
import dynamic from 'next/dynamic';
import {Phone,Video} from 'lucide-react';
import {Button} from '@/components/ui/button';
import type {AudioCall} from '@/types/calls';
import type {JoinDevices} from './call-room';
import {VideoPreview} from './video-preview';

const AudioRoom=dynamic(()=>import('./audio-room').then(m=>m.AudioRoom),{ssr:false});
type Action='join'|'decline'|'cancel'|'leave'|'end'|'heartbeat'|'kick';
interface CallContextValue {
 currentUserId:string;calls:AudioCall[];ready:boolean;groupReady:boolean;videoReady:boolean;busy:boolean;
 start:(conversationId:string)=>Promise<void>;
 preview:(conversationId:string)=>void;
 command:(callId:string,action:Action,targetId?:string)=>Promise<void>;
}
const CallContext=createContext<CallContextValue|null>(null);
export function CallProvider({currentUserId,children}:{currentUserId:string;children:React.ReactNode}) {
 const [calls,setCalls]=useState<AudioCall[]>([]);
 const [ready,setReady]=useState(false);
 const [groupReady,setGroupReady]=useState(false);
 const [videoReady,setVideoReady]=useState(false);
 const [preview,setPreview]=useState<{conversationId?:string;callId?:string}|null>(null);
 const [joinDevices,setJoinDevices]=useState<JoinDevices>();
 const [expanded,setExpanded]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState<string|null>(null);
 const [paused,setPaused]=useState(false);
 const [pending,setPending]=useState(false);
 const [outcome,setOutcome]=useState<string|null>(null);
 const [owned,setOwned]=useState<{id:string;identity:string}|null>(null);
 const requests=useRef({id:0});const mounted=useRef(true);const lastSync=useRef(0);const mutation=useRef(false);
 const refresh=useCallback(()=>{
  const request=++requests.current.id;
  return fetch('/api/calls',{cache:'no-store'}).then(async response=>{
   if(!response.ok)throw new Error('Could not refresh call status.');
   const data=await response.json();
   if(!mounted.current||request!==requests.current.id)return;
   setCalls(data.calls);setReady(data.ready);setGroupReady(!!data.groupReady);setVideoReady(!!data.videoReady);setPending(!!data.mediaCleanupPending);lastSync.current=Date.now();
  }).catch(()=>{
   if(mounted.current&&Date.now()-lastSync.current>30000){setPaused(true);setJoinDevices(undefined);setPreview(null);setError('Call status connection lost. Audio stopped. Retry when connected.');}
  });
 },[]);
 useEffect(()=>{
  mounted.current=true;lastSync.current=Date.now();const tracker=requests.current;void refresh();const timer=window.setInterval(()=>void refresh(),3000);
  const online=()=>void refresh();window.addEventListener('online',online);
  return ()=>{mounted.current=false;tracker.id++;window.clearInterval(timer);window.removeEventListener('online',online);};
 },[refresh]);
 const apply=useCallback((call:AudioCall)=>{
  requests.current.id++;lastSync.current=Date.now();
  setCalls(previous=>call.state==='ended'?previous.filter(c=>c.id!==call.id):[call,...previous.filter(c=>c.id!==call.id)]);
  if(call.state==='ended')setOutcome(`Audio call: ${call.end_reason||'ended'}.`);
 },[]);
 const command=useCallback(async(callId:string,action:Action,targetId?:string)=>{
  if(action!=='heartbeat'&&mutation.current)return;
  if(action!=='heartbeat'){mutation.current=true;setBusy(true);setError(null);}
  if(action==='leave'||action==='cancel'||action==='end'){setPaused(true);setJoinDevices(undefined);setPreview(null);}
  try{
   const response=await fetch('/api/calls',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({callId,action,...(targetId?{targetId}:{})})});
   const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not update call.');
   if(!mounted.current)return;
   apply(data.call);setPending(!!data.mediaCleanupPending);
   if(action==='join'){setPaused(false);setOutcome(null);setOwned({id:data.call.id,identity:data.call.participants.find((p:{user_id:string})=>p.user_id===currentUserId).media_identity});}
  }catch(e){
   if(mounted.current){
    if(action!=='heartbeat')setError(e instanceof Error?e.message:'Connection lost. Try again.');
    else if(Date.now()-lastSync.current>30000){setPaused(true);setJoinDevices(undefined);setPreview(null);setError('Call status connection lost. Audio stopped. Retry when connected.');}
   }
  }finally{if(action!=='heartbeat'){mutation.current=false;if(mounted.current)setBusy(false);}}
 },[apply,currentUserId]);
 const current=calls.find(c=>c.participants.some(p=>p.user_id===currentUserId&&p.state==='joined'&&!p.blocked));
 const identity=current?.participants.find(p=>p.user_id===currentUserId)?.media_identity;
 const ownsCurrent=!!current&&owned?.id===current.id&&owned.identity===identity;
 const activeCallId=ownsCurrent?current?.id:null;
 useEffect(()=>{
  if(!activeCallId)return;const timer=window.setInterval(()=>void command(activeCallId,'heartbeat'),10000);return ()=>window.clearInterval(timer);
 },[activeCallId,command]);
 const start=useCallback(async(conversationId:string,mode:'audio'|'video'='audio')=>{
  if(mutation.current)return;mutation.current=true;setBusy(true);setError(null);setOutcome(null);
  try{
   const response=await fetch('/api/calls',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({conversationId,mode})});
   const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not start call.');
   let call:AudioCall=data.call;
   if(call.state!=='ended'&&!call.participants.some(p=>p.user_id===currentUserId&&p.state==='joined')){
    const joined=await fetch('/api/calls',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({callId:call.id,action:'join'})});
    const result=await joined.json();if(!joined.ok)throw new Error(result.error||'Could not join call.');call=result.call;
   }
   if(mounted.current){apply(call);setPaused(false);setPending(!!data.mediaCleanupPending);const self=call.participants.find(p=>p.user_id===currentUserId);if(call.state!=='ended'&&self?.state==='joined')setOwned({id:call.id,identity:self.media_identity});}
  }catch(e){if(mounted.current)setError(e instanceof Error?e.message:'Connection lost. Try again.');}
  finally{mutation.current=false;if(mounted.current)setBusy(false);}
 },[apply,currentUserId]);
 const incoming=calls.find(c=>c.caller_id!==currentUserId&&c.participants.some(p=>p.user_id===currentUserId&&p.state==='invited'&&!p.blocked));
 return <CallContext.Provider value={{currentUserId,calls,ready,groupReady,videoReady,busy,start:async id=>{setJoinDevices(undefined);await start(id);},preview:id=>setPreview({conversationId:id}),command}}>
  {children}
  {preview&&(!preview.callId||calls.some(c=>c.id===preview.callId&&c.state!=='ended'))&&<VideoPreview cameraAllowed={videoReady} onCancel={()=>setPreview(null)} onJoin={devices=>{setJoinDevices(devices);setExpanded(true);setPreview(null);if(preview.callId)void command(preview.callId,'join');else if(preview.conversationId)void start(preview.conversationId,'video');}}/>}
  {(incoming||current||error||outcome||pending)&&<aside aria-label="Calls" className={`fixed bottom-4 right-4 z-40 max-h-[85vh] ${expanded?'w-[min(960px,calc(100vw-2rem))]':'w-[min(380px,calc(100vw-2rem))]'} overflow-auto rounded-xl border bg-card p-4 shadow-xl space-y-3`}>
   {error&&<div role="alert" className="text-sm text-destructive">{error}<Button size="sm" variant="outline" onClick={()=>{setJoinDevices(undefined);setError(null);void refresh().then(()=>setPaused(false));}}>Retry connection</Button></div>}
   {outcome&&!current&&<div role="status" className="text-sm">{outcome}<Button size="sm" variant="ghost" onClick={()=>setOutcome(null)}>Dismiss</Button></div>}
   {pending&&<p role="status" className="text-xs">Audio access update pending. Retrying…</p>}
   {incoming&&<div className="space-y-2"><p className="font-semibold">Incoming {incoming.initialMode==='video'?'video':'audio'} call</p><p className="text-sm">{incoming.caller_name} · {incoming.title}</p><div className="flex gap-2"><Button disabled={busy||!!current} onClick={()=>{setJoinDevices(undefined);if(incoming.initialMode==='video')setPreview({callId:incoming.id});else void command(incoming.id,'join');}}>Accept</Button><Button variant="outline" disabled={busy} onClick={()=>void command(incoming.id,'decline')}>Decline</Button></div>{current&&<p className="text-xs">Leave your current call before accepting.</p>}</div>}
   {current&&<div className="space-y-2"><p className="font-semibold">{current.title}</p><p role="status" className="text-sm">{current.state==='ringing'?'Ringing…':current.initialMode==='video'?'Video call':'Audio call'}</p>
    <Button size="sm" variant="ghost" aria-label={expanded?'Minimize call':'Expand call'} onClick={()=>setExpanded(value=>!value)}>{expanded?'Minimize':'Expand'}</Button>
    {!ownsCurrent?<><p>Call active in another tab</p><p className="text-xs">Continuing here disconnects media in the other tab.</p><Button disabled={busy} onClick={()=>{setJoinDevices(undefined);setOwned({id:current.id,identity:identity!});setPaused(false);}}>Continue call in this tab</Button></>:<><p className="text-xs">Audio active in this tab</p>{!paused?<AudioRoom key={current.id+identity} call={current} currentUserId={currentUserId} expanded={expanded} initialDevices={joinDevices} onLeave={()=>void command(current.id,current.state==='ringing'?'cancel':'leave')} onKick={id=>void command(current.id,'kick',id)}/>:<><p>Media stopped.</p><Button disabled={busy} onClick={()=>{setJoinDevices(undefined);void refresh().then(()=>setPaused(false));}}>Reconnect call</Button><Button variant="outline" disabled={busy} onClick={()=>void command(current.id,'leave')}>Leave call</Button></>}</>}
    {current.kind==='group'&&(current.caller_id===currentUserId||current.current_user_is_admin)&&<Button variant="outline" size="sm" disabled={busy} onClick={()=>void command(current.id,'end')}>End for everyone</Button>}
   </div>}
  </aside>}
 </CallContext.Provider>;
}

export function CallControls({conversation}:{conversation:{id:string;type:string}}){
 const context=useContext(CallContext);const [history,setHistory]=useState<AudioCall[]|null>(null);const [open,setOpen]=useState(false);const [error,setError]=useState<string|null>(null);
 useEffect(()=>{if(!open)return;const controller=new AbortController();
  void fetch('/api/calls?conversationId='+conversation.id,{signal:controller.signal,cache:'no-store'}).then(async response=>{const data=await response.json();if(!response.ok)throw new Error('Could not load call history.');if(!controller.signal.aborted)setHistory(data.calls);}).catch(()=>{if(!controller.signal.aborted)setError('Could not load call history. Close and retry.');});
  return ()=>controller.abort();
 },[conversation.id,open]);
 if(!context||!['direct','group'].includes(conversation.type))return null;
 const current=context.calls.find(c=>c.participants.some(p=>p.user_id===context.currentUserId&&p.state==='joined'&&!p.blocked));
 return <div className="relative flex items-center gap-1">
  <Button size="icon" variant="ghost" disabled={!context.ready||(conversation.type==='group'&&!context.groupReady)||context.busy||!!current} aria-label="Start audio call" title={!context.ready?'Audio calling is not enabled yet':conversation.type==='group'&&!context.groupReady?'Group audio is not enabled yet':current?'Already in a call':'Start or join audio call'} onClick={()=>void context.start(conversation.id)}><Phone className="h-4 w-4"/></Button>
  <Button size="icon" variant="ghost" disabled={!context.videoReady||(conversation.type==='group'&&!context.groupReady)||context.busy||!!current} aria-label="Start video call" title={!context.videoReady?'Video calling is not enabled yet':'Start or join video call'} onClick={()=>context.preview(conversation.id)}><Video className="h-4 w-4"/></Button>
  <Button size="sm" variant="ghost" onClick={()=>{setError(null);setOpen(value=>!value);setHistory(null);}}>Call history</Button>
  {open&&<div className="absolute right-0 top-10 z-30 max-h-80 w-72 overflow-auto rounded-lg border bg-card p-3 shadow-lg"><p className="font-semibold text-sm">Call history</p>{error?<p role="alert">{error}</p>:history===null?<p>Loading…</p>:history.length===0?<p className="text-sm">No calls yet.</p>:<ul className="space-y-2">{history.map(c=><li key={c.id} className="border-b py-2 text-xs"><p>{c.initialMode==='video'?'Video':'Audio'} · {c.caller_name} · {c.end_reason?c.end_reason[0].toUpperCase()+c.end_reason.slice(1):c.state==='ringing'?'Ringing':'In progress'}</p><time>{new Date(c.created_at).toLocaleString()}</time>{c.started_at&&c.ended_at&&<p>{Math.max(0,Math.round((Date.parse(c.ended_at)-Date.parse(c.started_at))/1000))} seconds</p>}</li>)}</ul>}</div>}
 </div>;
}
