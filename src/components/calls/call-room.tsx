"use client";
import {useEffect,useRef,useState} from 'react';
import {Room,RoomEvent,Track,type RemoteTrack,type Participant} from 'livekit-client';
import {Button} from '@/components/ui/button';
import {Popover,PopoverTrigger,PopoverContent} from '@/components/ui/popover';
import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuItem} from '@/components/ui/dropdown-menu';
import {Ellipsis,Mic,MicOff,Video,VideoOff,ScreenShare,PhoneOff} from 'lucide-react';
import {MediaSession,type CaptureKind} from '@/lib/calls/media-session';
import {TrackVideo} from './track-video';
import type {AudioCall} from '@/types/calls';

export interface JoinDevices {camera:boolean;microphone:boolean;cameraId?:string;microphoneId?:string;}
interface Props {call:AudioCall;currentUserId:string;onLeave:()=>void;onKick:(userId:string)=>void;expanded?:boolean;initialDevices?:JoinDevices;}
type Person={identity:string;camera?:Track;screen?:Track;muted:boolean;quality:string;};
function mediaError(error:unknown,kind:string){
 if(error instanceof DOMException){
  if(error.name==='NotAllowedError')return `${kind} access was denied. Allow access in your browser, then retry.`;
  if(error.name==='NotFoundError')return `No ${kind.toLowerCase()} found. Connect one, then retry.`;
  if(error.name==='NotReadableError')return `${kind} is busy or unavailable. Close other apps using it, then retry.`;
 }
 return error instanceof Error?error.message:`Could not enable ${kind.toLowerCase()}. Check the device and retry.`;
}
export function CallRoom({call,currentUserId,onLeave,onKick,expanded=true,initialDevices}:Props){
 const roomRef=useRef<Room|null>(null);const sessionRef=useRef<MediaSession|null>(null);const audioRef=useRef<HTMLDivElement>(null);
 const initial=useRef(initialDevices);const [connection,setConnection]=useState('Connecting…');
 const [enabled,setEnabled]=useState({microphone:false,camera:false,screen:false,screenAudio:false});
 const [capabilities,setCapabilities]=useState({video:false,screenShare:false});
 const [changing,setChanging]=useState<CaptureKind|null>(null);const [error,setError]=useState<string|null>(null);
 const [devices,setDevices]=useState<MediaDeviceInfo[]>([]);const [input,setInput]=useState(initialDevices?.microphoneId||'default');const [output,setOutput]=useState('default');const [camera,setCamera]=useState(initialDevices?.cameraId||'default');
 const [speakers,setSpeakers]=useState<string[]>([]);const [people,setPeople]=useState<Person[]>([]);
 const [focus,setFocus]=useState<string|null>(null);const focusRef=useRef<string|null>(null);const [includeAudio,setIncludeAudio]=useState(false);const [audioBlocked,setAudioBlocked]=useState(false);
 const [attempt,setAttempt]=useState(0);
 useEffect(()=>{
  let disposed=false;const controller=new AbortController();
  const room=new Room({adaptiveStream:true,dynacast:true,videoCaptureDefaults:{resolution:{width:1280,height:720,frameRate:30}},publishDefaults:{simulcast:true,screenShareEncoding:{maxBitrate:3000000,maxFramerate:15}}});roomRef.current=room;
  const attached=new Set<RemoteTrack>();
  const roster=()=>{
   if(disposed)return;
   const next=[room.localParticipant,...room.remoteParticipants.values()].map(p=>{
    const publications=[...p.trackPublications.values()];
    return {identity:p.identity,camera:publications.find(t=>t.source===Track.Source.Camera&&!t.isMuted)?.track,screen:publications.find(t=>t.source===Track.Source.ScreenShare&&!t.isMuted)?.track,muted:!publications.some(t=>t.source===Track.Source.Microphone&&!t.isMuted),quality:p.connectionQuality||'unknown'};
   });
   const presentations=next.filter(p=>p.screen);
   if(!presentations.some(p=>p.identity===focusRef.current))focusRef.current=presentations[0]?.identity||null;
   setFocus(focusRef.current);setPeople(next);
  };
  const session=new MediaSession(room.localParticipant,()=>{
   if(disposed)return;
   setEnabled({microphone:session.has('microphone'),camera:session.has('camera'),screen:session.has('screen'),screenAudio:session.screenAudio});roster();
  });sessionRef.current=session;
  const enumerate=()=>{if(navigator.mediaDevices?.enumerateDevices)void navigator.mediaDevices.enumerateDevices().then(list=>{if(!disposed)setDevices(list);}).catch(()=>{});};
  const attachAudio=(track:RemoteTrack)=>{
   if(disposed||track.kind!==Track.Kind.Audio||attached.has(track))return;
   attached.add(track);audioRef.current?.appendChild(track.attach());
  };
  room.on(RoomEvent.TrackSubscribed,track=>{attachAudio(track);roster();})
   .on(RoomEvent.TrackUnsubscribed,track=>{track.detach().forEach(e=>e.remove());attached.delete(track);roster();})
   .on(RoomEvent.LocalTrackPublished,roster).on(RoomEvent.LocalTrackUnpublished,roster)
   .on(RoomEvent.TrackMuted,roster).on(RoomEvent.TrackUnmuted,roster)
   .on(RoomEvent.ConnectionQualityChanged,roster)
   .on(RoomEvent.AudioPlaybackStatusChanged,()=>{if(!disposed)setAudioBlocked(!room.canPlaybackAudio);})
   .on(RoomEvent.Reconnecting,()=>{if(!disposed)setConnection('Reconnecting…');})
   .on(RoomEvent.Reconnected,()=>{if(!disposed){setConnection('Connected');roster();}})
   .on(RoomEvent.Disconnected,()=>{session.close();attached.forEach(track=>track.detach().forEach(e=>e.remove()));attached.clear();if(!disposed){setPeople([]);setConnection('Disconnected');setChanging(null);setEnabled({microphone:false,camera:false,screen:false,screenAudio:false});}})
   .on(RoomEvent.ActiveSpeakersChanged,(active:Participant[])=>{if(!disposed)setSpeakers(active.map(p=>p.identity));})
   .on(RoomEvent.ParticipantConnected,roster).on(RoomEvent.ParticipantDisconnected,roster);
  navigator.mediaDevices?.addEventListener?.('devicechange',enumerate);
  void (async()=>{
   try{
    const response=await fetch(`/api/calls/${call.id}/token`,{method:'POST',signal:controller.signal,cache:'no-store'});
    const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not connect call.');
    if(disposed)return;setCapabilities(data.capabilities||{video:false,screenShare:false});
    await room.connect(data.url,data.token);
    if(disposed){await room.disconnect();return;}
    setConnection('Connected');setError(null);roster();enumerate();
    const preferences=attempt===0?initial.current:undefined;initial.current=undefined;
    for(const kind of ['microphone','camera'] as const){
     if(!preferences?.[kind]||(kind==='camera'&&!data.capabilities?.video))continue;
     const deviceId=kind==='camera'?preferences.cameraId:preferences.microphoneId;
     try{await session.capture(kind,()=>navigator.mediaDevices.getUserMedia(kind==='camera'?{video:{deviceId:deviceId&&deviceId!=='default'?{exact:deviceId}:undefined,width:{ideal:1280},height:{ideal:720},frameRate:{ideal:30}},audio:false}:{audio:{deviceId:deviceId&&deviceId!=='default'?{exact:deviceId}:undefined},video:false}));}
     catch(e){if(!disposed)setError(mediaError(e,kind==='camera'?'Camera':'Microphone'));}
    }
   }catch(e){session.close();if(!disposed){setConnection('Disconnected');setError(mediaError(e,'Call'));}}
  })();
  return ()=>{disposed=true;controller.abort();session.close();navigator.mediaDevices?.removeEventListener?.('devicechange',enumerate);attached.forEach(track=>track.detach().forEach(e=>e.remove()));void room.disconnect();if(roomRef.current===room){roomRef.current=null;sessionRef.current=null;}};
 },[call.id,attempt]);
 async function toggle(kind:CaptureKind){
  const session=sessionRef.current;const room=roomRef.current;
  if(!session||!room||changing||connection!=='Connected')return;
  setError(null);if(session.has(kind)){session.stop(kind);return;}setChanging(kind);
  try{
   if(kind==='screen'){
    const supported=navigator.mediaDevices.getSupportedConstraints() as MediaTrackSupportedConstraints & {restrictOwnAudio?:boolean;suppressLocalAudioPlayback?:boolean};
    const safeAudio=includeAudio&&supported.restrictOwnAudio===true&&supported.suppressLocalAudioPlayback===true;
    await session.capture('screen',()=>navigator.mediaDevices.getDisplayMedia({video:{width:{ideal:1920},height:{ideal:1080},frameRate:{ideal:15},displaySurface:'browser'},audio:safeAudio?{restrictOwnAudio:{exact:true},suppressLocalAudioPlayback:{exact:true}}:false,selfBrowserSurface:'exclude',systemAudio:'exclude',surfaceSwitching:'exclude'} as DisplayMediaStreamOptions),safeAudio);
    if(sessionRef.current===session&&includeAudio&&session.has('screen')&&!session.screenAudio)setError('Screen sharing is active. Tab audio is unavailable or cannot be safely isolated in this browser.');
   }else{
    const id=kind==='camera'?camera:input;
    await session.capture(kind,()=>navigator.mediaDevices.getUserMedia(kind==='camera'?{video:{deviceId:id!=='default'?{exact:id}:undefined,width:{ideal:1280},height:{ideal:720},frameRate:{ideal:30}},audio:false}:{audio:{deviceId:id!=='default'?{exact:id}:undefined},video:false}));
   }
   if(sessionRef.current===session&&navigator.mediaDevices?.enumerateDevices)setDevices(await navigator.mediaDevices.enumerateDevices());
  }catch(e){if(sessionRef.current===session&&!(kind==='screen'&&e instanceof DOMException&&['NotAllowedError','AbortError'].includes(e.name)))setError(mediaError(e,kind==='camera'?'Camera':kind==='microphone'?'Microphone':'Screen sharing'));}
  finally{if(sessionRef.current===session)setChanging(null);}
 }
 async function changeDevice(kind:'audioinput'|'audiooutput'|'videoinput',id:string){
  const session=sessionRef.current;if(changing)return;
  if(kind==='audioinput')setInput(id);else if(kind==='audiooutput')setOutput(id);else setCamera(id);
  try{
   if(kind==='audiooutput')await roomRef.current?.switchActiveDevice(kind,id);
   else{
    const captureKind=kind==='videoinput'?'camera':'microphone';
    if(session?.has(captureKind)){
     setChanging(captureKind);session.stop(captureKind);
     await session.capture(captureKind,()=>navigator.mediaDevices.getUserMedia(kind==='videoinput'?{video:{deviceId:id==='default'?undefined:{exact:id},width:{ideal:1280},height:{ideal:720},frameRate:{ideal:30}},audio:false}:{audio:{deviceId:id==='default'?undefined:{exact:id}},video:false}));
    }
   }
   if(sessionRef.current===session)setError(null);
  }catch(e){if(sessionRef.current===session)setError(mediaError(e,'Device'));}finally{if(sessionRef.current===session)setChanging(null);}
 }
 const presentations=people.filter(p=>p.screen);const selected=presentations.find(p=>p.identity===focus)||presentations[0];
 const name=(identity:string)=>call.participants.find(p=>p.media_identity===identity)?.display_name||'Participant';
 return <div className="space-y-3">
  <p role="status" className="text-xs text-muted-foreground">{connection}</p>
  {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  {audioBlocked&&<p role="alert" className="text-sm">Sound playback is blocked. Select Enable sound to hear the call.</p>}
  {connection==='Disconnected'&&<Button size="sm" variant="outline" onClick={()=>{setConnection('Connecting…');setChanging(null);setAttempt(value=>value+1);}}>Reconnect call</Button>}
  {enabled.screen&&<p role="status" className="rounded bg-red-600 p-2 text-sm text-white">You are sharing your screen{enabled.screenAudio?' with tab audio':''}<Button size="sm" variant="secondary" className="ml-2" onClick={()=>sessionRef.current?.stop('screen')}>Stop sharing</Button></p>}
  <div className="flex flex-wrap gap-2">
   <Button className="min-h-11" size="sm" variant="outline" disabled={connection!=='Connected'||!!changing} aria-label={enabled.microphone?'Mute microphone':'Unmute microphone'} onClick={()=>void toggle('microphone')}>{enabled.microphone?<Mic aria-hidden="true"/>:<MicOff aria-hidden="true"/>}{enabled.microphone?'Mic on':'Mic off'}</Button>
   {capabilities.video&&<Button className="min-h-11" size="sm" variant="outline" disabled={connection!=='Connected'||!!changing} aria-label={enabled.camera?'Turn camera off':'Turn camera on'} onClick={()=>void toggle('camera')}>{enabled.camera?<Video aria-hidden="true"/>:<VideoOff aria-hidden="true"/>}{enabled.camera?'Camera on':'Camera off'}</Button>}
   {capabilities.screenShare&&typeof navigator!=='undefined'&&typeof navigator.mediaDevices?.getDisplayMedia==='function'&&!enabled.screen&&<Button className="min-h-11" size="sm" variant="outline" disabled={connection!=='Connected'||!!changing} onClick={()=>void toggle('screen')}><ScreenShare aria-hidden="true"/>{changing==='screen'?'Choosing screen…':'Share screen'}</Button>}
   {audioBlocked&&<Button className="min-h-11" size="sm" variant="outline" onClick={()=>void roomRef.current?.startAudio().then(()=>setAudioBlocked(false)).catch(()=>setError('Audio playback is blocked. Check your browser sound settings.'))}>Enable sound</Button>}
   <Popover><PopoverTrigger render={<Button className="min-h-11" size="sm" variant="outline" aria-label="More call options"/>}><Ellipsis aria-hidden="true"/>More</PopoverTrigger><PopoverContent align="end" className="w-72 space-y-3">
    <h3 className="text-sm font-semibold">Call options</h3>
    {(['audioinput','videoinput','audiooutput'] as const).filter(kind=>kind!=='audiooutput'||'setSinkId' in HTMLMediaElement.prototype).filter(kind=>kind!=='videoinput'||capabilities.video).map(kind=><label key={kind} className="block text-sm">{kind==='audioinput'?'Microphone':kind==='videoinput'?'Camera':'Speaker'}<select disabled={!!changing} aria-label={`${kind==='audioinput'?'Microphone':kind==='videoinput'?'Camera':'Speaker'} device`} className="mt-1 min-h-11 w-full rounded-lg border bg-background p-2" value={kind==='audioinput'?input:kind==='videoinput'?camera:output} onChange={e=>void changeDevice(kind,e.target.value)}><option value="default">System default</option>{devices.filter(d=>d.kind===kind&&d.deviceId!=='default').map((d,i)=><option key={d.deviceId} value={d.deviceId}>{d.label||`Device ${i+1}`}</option>)}</select></label>)}
    {capabilities.screenShare&&<label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={includeAudio} disabled={enabled.screen||changing==='screen'} onChange={e=>setIncludeAudio(e.target.checked)}/>Include tab audio (when safely supported)</label>}
   </PopoverContent></Popover>
   <Button className="min-h-11" size="sm" variant="destructive" onClick={()=>{sessionRef.current?.close();onLeave();}}><PhoneOff aria-hidden="true"/>{call.state==='ringing'?'Cancel call':'Leave call'}</Button>
  </div>
  <div hidden={!expanded}>
   {selected?.screen&&<section aria-label="Presentation" className="mb-3 rounded bg-black text-white"><p className="p-2 text-sm">{name(selected.identity)} is presenting</p><TrackVideo track={selected.screen} label={`${name(selected.identity)} shared screen`}/>{presentations.length>1&&<label className="block p-2 text-sm">Presentation<select aria-label="Select presentation" className="ml-2 rounded bg-gray-900 p-1" value={selected.identity} onChange={e=>{focusRef.current=e.target.value;setFocus(e.target.value);}}>{presentations.map(p=><option key={p.identity} value={p.identity}>{name(p.identity)}</option>)}</select></label>}</section>}
   <div className="grid grid-cols-2 gap-3" aria-label="Participant gallery">{call.participants.filter(p=>p.state==='joined'&&!p.blocked).map(p=>{
    const person=people.find(q=>q.identity===p.media_identity);return <div key={p.user_id} className={`relative overflow-hidden rounded-xl border bg-muted p-2 ${speakers.includes(p.media_identity)?'border-primary ring-1 ring-primary':''}`}>
     <div className="flex aspect-video items-center justify-center rounded-lg">{person?.camera?<TrackVideo track={person.camera} mirror={p.user_id===currentUserId} label={`${p.display_name} camera`}/>:<span className="flex size-14 items-center justify-center rounded-full bg-accent text-xl font-medium text-accent-foreground" aria-label={`${p.display_name}, camera off`}>{(p.display_name||'?').trim().split(/\s+/u).slice(0,2).map(word=>Array.from(word)[0]).join('').toLocaleUpperCase()}</span>}</div>
     <p className="mt-1 break-words text-xs">{p.display_name}{p.user_id===currentUserId?' (you)':''} · {person?.muted!==false?'Muted':speakers.includes(p.media_identity)?'Speaking':'Mic on'}</p>
     {call.kind==='group'&&call.current_user_is_admin&&p.user_id!==currentUserId&&<DropdownMenu><DropdownMenuTrigger render={<Button size="icon" variant="ghost" className="absolute right-1 top-1" aria-label={`Participant actions for ${p.display_name}`}/>}><Ellipsis aria-hidden="true"/></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem variant="destructive" onClick={()=>onKick(p.user_id)}>Remove {p.display_name} from call</DropdownMenuItem></DropdownMenuContent></DropdownMenu>}
    </div>;
   })}</div>
  </div>
  <div ref={audioRef} className="hidden" aria-hidden="true"/>
 </div>;
}
