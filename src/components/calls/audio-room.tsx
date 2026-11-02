"use client";

import {useEffect,useRef,useState} from 'react';
import {Room,RoomEvent,Track,type RemoteTrack,type Participant} from 'livekit-client';
import {Mic,MicOff,PhoneOff} from 'lucide-react';
import {Button} from '@/components/ui/button';
import type {AudioCall} from '@/types/calls';

interface Props {call:AudioCall;currentUserId:string;onLeave:()=>void;onKick:(userId:string)=>void;}
export function AudioRoom({call,currentUserId,onLeave,onKick}:Props){
 const roomRef=useRef<Room|null>(null);const audioRef=useRef<HTMLDivElement>(null);
 const [connection,setConnection]=useState('Connecting…');const [muted,setMuted]=useState(true);
 const [changing,setChanging]=useState(false);const [error,setError]=useState<string|null>(null);
 const [devices,setDevices]=useState<MediaDeviceInfo[]>([]);const [input,setInput]=useState('default');const [output,setOutput]=useState('default');
 const [speakers,setSpeakers]=useState<string[]>([]);const [online,setOnline]=useState<string[]>([]);
 const [attempt,setAttempt]=useState(0);
 useEffect(()=>{
  let disposed=false;const controller=new AbortController();const room=new Room();roomRef.current=room;
  const attached=new Set<RemoteTrack>();
  const roster=()=>{if(!disposed)setOnline([room.localParticipant.identity,...room.remoteParticipants.keys()]);};
  room.on(RoomEvent.TrackSubscribed,track=>{
   if(disposed||track.kind!==Track.Kind.Audio)return;attached.add(track);audioRef.current?.appendChild(track.attach());
  }).on(RoomEvent.TrackUnsubscribed,track=>{track.detach().forEach(e=>e.remove());attached.delete(track);})
   .on(RoomEvent.Reconnecting,()=>{if(!disposed)setConnection('Reconnecting…');})
   .on(RoomEvent.Reconnected,()=>{if(!disposed){setConnection('Connected');roster();}})
   .on(RoomEvent.Disconnected,()=>{if(!disposed){setConnection('Disconnected');setMuted(true);}})
   .on(RoomEvent.ActiveSpeakersChanged,(active:Participant[])=>{if(!disposed)setSpeakers(active.map(p=>p.identity));})
   .on(RoomEvent.ParticipantConnected,roster).on(RoomEvent.ParticipantDisconnected,roster);
  void (async()=>{
   try{
    const response=await fetch(`/api/calls/${call.id}/token`,{method:'POST',signal:controller.signal,cache:'no-store'});
    const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not connect audio.');
    if(disposed)return;
    await room.connect(data.url,data.token);
    if(disposed){await room.disconnect();return;}
    setConnection('Connected');setMuted(true);setError(null);roster();
    // Enumerating devices does not request microphone access. Unmute does.
    if(navigator.mediaDevices?.enumerateDevices){const available=await navigator.mediaDevices.enumerateDevices();if(!disposed)setDevices(available);}
   }catch(e){if(!disposed){setConnection('Disconnected');setError(e instanceof Error?e.message:'Could not connect audio.');}}
  })();
  return ()=>{disposed=true;controller.abort();attached.forEach(track=>track.detach().forEach(e=>e.remove()));void room.disconnect();if(roomRef.current===room)roomRef.current=null;};
 },[call.id,attempt]);
 async function toggleMicrophone(){
  const room=roomRef.current;if(!room||changing||connection!=='Connected')return;
  setChanging(true);setError(null);
  try{
   await room.localParticipant.setMicrophoneEnabled(muted);
   if(roomRef.current!==room)return;
   setMuted(!muted);
   if(navigator.mediaDevices?.enumerateDevices)setDevices(await navigator.mediaDevices.enumerateDevices());
  }catch(e){if(roomRef.current===room)setError(e instanceof DOMException&&e.name==='NotAllowedError'?'Microphone access was denied. Allow microphone access in your browser, then retry.':e instanceof DOMException&&e.name==='NotFoundError'?'No microphone found. Connect one, then retry.':'Could not change microphone. Check your device and retry.');}
  finally{if(roomRef.current===room)setChanging(false);}
 }
 async function changeDevice(kind:'audioinput'|'audiooutput',id:string){
  try{await roomRef.current?.switchActiveDevice(kind,id);if(kind==='audioinput')setInput(id);else setOutput(id);setError(null);}
  catch{setError('Could not switch audio device. Try another device.');}
 }
 return <div className="space-y-3">
  <p role="status" className="text-xs text-muted-foreground">{connection}</p>
  {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  {connection==='Disconnected'&&<Button size="sm" variant="outline" onClick={()=>{setConnection('Connecting…');setChanging(false);setMuted(true);setAttempt(value=>value+1);}}>Reconnect audio</Button>}
  <div className="flex flex-wrap gap-2">
   <Button size="sm" variant="outline" disabled={connection!=='Connected'||changing} aria-label={muted?'Unmute microphone':'Mute microphone'} onClick={()=>void toggleMicrophone()}>{muted?<MicOff className="mr-1 h-4 w-4"/>:<Mic className="mr-1 h-4 w-4"/>}{muted?'Unmute':'Mute'}</Button>
   <Button size="sm" variant="outline" onClick={()=>void roomRef.current?.startAudio().catch(()=>setError('Audio playback is blocked. Check your browser sound settings.'))}>Enable sound</Button>
   <Button size="sm" variant="destructive" onClick={onLeave}><PhoneOff className="mr-1 h-4 w-4"/>{call.state==='ringing'?'Cancel call':'Leave call'}</Button>
  </div>
  <label className="block text-xs">Microphone<select aria-label="Microphone device" className="mt-1 w-full rounded border bg-background p-1" value={input} onChange={e=>void changeDevice('audioinput',e.target.value)}><option value="default">System default</option>{devices.filter(d=>d.kind==='audioinput'&&d.deviceId!=='default').map((d,i)=><option key={d.deviceId} value={d.deviceId}>{d.label||`Microphone ${i+1}`}</option>)}</select></label>
  {typeof HTMLMediaElement!=='undefined'&&'setSinkId' in HTMLMediaElement.prototype&&<label className="block text-xs">Speaker<select aria-label="Speaker device" className="mt-1 w-full rounded border bg-background p-1" value={output} onChange={e=>void changeDevice('audiooutput',e.target.value)}><option value="default">System default</option>{devices.filter(d=>d.kind==='audiooutput'&&d.deviceId!=='default').map((d,i)=><option key={d.deviceId} value={d.deviceId}>{d.label||`Speaker ${i+1}`}</option>)}</select></label>}
  <ul className="space-y-1 text-xs" aria-label="Call participants">{call.participants.filter(p=>p.state==='joined'&&!p.blocked).map(p=><li key={p.user_id} className="flex items-center justify-between gap-2"><span className={speakers.includes(p.media_identity)?'font-semibold text-green-600':''}>{p.display_name}{p.user_id===currentUserId?' (you)':''} · {speakers.includes(p.media_identity)?'Speaking':online.includes(p.media_identity)?'Connected':'Connecting'}</span>{call.kind==='group'&&call.current_user_is_admin&&p.user_id!==currentUserId&&<Button size="sm" variant="ghost" aria-label={`Remove ${p.display_name} from call`} onClick={()=>onKick(p.user_id)}>Remove</Button>}</li>)}</ul>
  <div ref={audioRef} className="hidden" aria-hidden="true"/>
 </div>;
}
