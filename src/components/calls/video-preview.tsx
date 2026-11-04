"use client";
import {useEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import type {JoinDevices} from './call-room';

export function VideoPreview({cameraAllowed,onJoin,onCancel}:{cameraAllowed:boolean;onJoin:(devices:JoinDevices)=>void;onCancel:()=>void}){
 const streams=useRef<{camera?:MediaStream;microphone?:MediaStream}>({});const generation=useRef(0);const alive=useRef(true);const video=useRef<HTMLVideoElement>(null);
 const [camera,setCamera]=useState(false);const [microphone,setMicrophone]=useState(false);const [pending,setPending]=useState(false);const [error,setError]=useState<string|null>(null);
 const [devices,setDevices]=useState<MediaDeviceInfo[]>([]);const [cameraId,setCameraId]=useState('default');const [microphoneId,setMicrophoneId]=useState('default');
 function stop(){generation.current++;Object.values(streams.current).forEach(s=>s?.getTracks().forEach(t=>t.stop()));streams.current={};if(video.current)video.current.srcObject=null;}
 useEffect(()=>{
  alive.current=true;void navigator.mediaDevices?.enumerateDevices?.().then(list=>{if(alive.current)setDevices(list);}).catch(()=>{});
  return ()=>{alive.current=false;stop();};
 },[]);
 async function toggle(kind:'camera'|'microphone'){
  if(pending)return;setError(null);
  const previous=streams.current[kind];
  if(previous){previous.getTracks().forEach(t=>t.stop());delete streams.current[kind];if(kind==='camera'){setCamera(false);if(video.current)video.current.srcObject=null;}else setMicrophone(false);return;}
  const version=generation.current;setPending(true);
  try{
   const id=kind==='camera'?cameraId:microphoneId;
   const stream=await navigator.mediaDevices.getUserMedia(kind==='camera'?{video:{deviceId:id!=='default'?{exact:id}:undefined,width:{ideal:1280},height:{ideal:720}},audio:false}:{audio:{deviceId:id!=='default'?{exact:id}:undefined},video:false});
   if(!alive.current||generation.current!==version){stream.getTracks().forEach(t=>t.stop());return;}
   streams.current[kind]=stream;
   stream.getTracks().forEach(t=>t.addEventListener('ended',()=>{if(alive.current){if(kind==='camera')setCamera(false);else setMicrophone(false);delete streams.current[kind];}},{once:true}));
   if(kind==='camera'){setCamera(true);if(video.current)video.current.srcObject=stream;}else setMicrophone(true);
   const list=await navigator.mediaDevices.enumerateDevices();if(alive.current)setDevices(list);
  }catch{if(alive.current)setError(`Could not open ${kind}. Check browser permissions and whether another app is using the device. You can still join without it.`);}
  finally{if(alive.current)setPending(false);}
 }
 function join(withCamera:boolean){const selection={camera:withCamera&&camera,microphone,cameraId,microphoneId};stop();onJoin(selection);}
 return <div role="dialog" aria-modal="true" aria-label="Video call preview" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"><div className="max-h-[90vh] w-full max-w-lg space-y-3 overflow-auto rounded-xl border bg-card p-5 shadow-xl">
  <h2 className="font-semibold">Video call preview</h2><p className="text-sm">Camera and microphone start off. Enable each device when you are ready.</p>
  <div className="relative flex aspect-video items-center justify-center rounded bg-muted"><video ref={video} muted autoPlay playsInline aria-label="Local camera preview" className="absolute h-full w-full object-contain" style={{transform:'scaleX(-1)',visibility:camera?'visible':'hidden'}}/>{!camera&&<p>Camera off</p>}</div>
  {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={pending||!cameraAllowed} onClick={()=>void toggle('camera')}>{camera?'Stop preview':'Preview camera'}</Button><Button variant="outline" disabled={pending} onClick={()=>void toggle('microphone')}>{microphone?'Mute preview microphone':'Enable preview microphone'}</Button></div>
  <p className="text-xs">Microphone {microphone?'on':'off'}</p>
  {(['videoinput','audioinput'] as const).map(kind=><label key={kind} className="block text-sm">{kind==='videoinput'?'Camera':'Microphone'}<select aria-label={`Preview ${kind==='videoinput'?'camera':'microphone'} device`} className="mt-1 w-full rounded border bg-background p-2" value={kind==='videoinput'?cameraId:microphoneId} disabled={pending||(kind==='videoinput'?camera:microphone)} onChange={e=>kind==='videoinput'?setCameraId(e.target.value):setMicrophoneId(e.target.value)}><option value="default">System default</option>{devices.filter(d=>d.kind===kind&&d.deviceId!=='default').map((d,i)=><option key={d.deviceId} value={d.deviceId}>{d.label||`Device ${i+1}`}</option>)}</select></label>)}
  <div className="flex flex-wrap gap-2"><Button disabled={pending||!camera} onClick={()=>join(true)}>Join video call</Button><Button variant="outline" onClick={()=>join(false)}>Join without camera</Button><Button variant="ghost" onClick={()=>{stop();onCancel();}}>Cancel preview</Button></div>
 </div></div>;
}
