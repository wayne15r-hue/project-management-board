"use client";
import {useEffect,useRef,useState} from 'react';
import {Play,Square,Volume2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {RINGTONES,RINGTONE_PLAYBACK_EVENT,createRingtoneAudio,saveRingtonePreference,type RingtonePreference,type RingtoneId} from '@/lib/calls/ringtones';
import {useRingtonePreference} from '@/components/calls/use-incoming-ringtone';
export function RingtoneSettings({userId}:{userId:string}){
 const preference=useRingtonePreference(userId);
 const [draft,setDraft]=useState<RingtonePreference|null>(null);
 const selected=draft||preference;
 const [playing,setPlaying]=useState<RingtoneId|null>(null);
 const [message,setMessage]=useState('');
 const player=useRef<ReturnType<typeof createRingtoneAudio>|null>(null);
 useEffect(()=>{const interrupted=()=>{if(player.current?.audio.paused){player.current=null;setPlaying(null);}};window.addEventListener(RINGTONE_PLAYBACK_EVENT,interrupted);return()=>{window.removeEventListener(RINGTONE_PLAYBACK_EVENT,interrupted);player.current?.stop();};},[userId]);
 function stop(){player.current?.stop();player.current=null;setPlaying(null);}
 async function preview(tune:RingtoneId){
  if(playing===tune){stop();return;}stop();setMessage('');
  let current:ReturnType<typeof createRingtoneAudio>|null=null;
  try{current=createRingtoneAudio({...selected,tune},false);player.current=current;setPlaying(tune);const own=current;current.audio.onended=()=>{if(player.current===own)stop();};await current.audio.play();}
  catch(error){if(!current||player.current===current){stop();setMessage(error instanceof Error?error.message:'Sound could not play. Check browser sound settings and try Preview again.');}}
 }
 return <section aria-labelledby="ringtone-heading" className="space-y-4 rounded-xl border bg-card p-5">
  <h2 id="ringtone-heading" className="flex items-center gap-2 font-semibold"><Volume2 className="size-4" aria-hidden="true"/>Incoming call tune</h2>
  <p className="text-sm text-muted-foreground">Choose what you hear when someone calls you. Saved for your account in this browser.</p>
  <fieldset><legend className="sr-only">Incoming call tune</legend>{[...RINGTONES,{id:'silent' as const,name:'Silent',description:'Show the incoming call without a tune.'}].map(tune=><div className="flex flex-wrap items-center gap-3 border-b py-3 last:border-0" key={tune.id}>
   <label className="flex min-h-11 min-w-0 flex-1 items-center gap-3"><input type="radio" name="ringtone" value={tune.id} checked={selected.tune===tune.id} onChange={()=>{stop();setDraft({...selected,tune:tune.id});setMessage('');}}/><span><span className="block text-sm font-medium">{tune.name}</span><span className="text-xs text-muted-foreground">{tune.description}</span></span></label>
   {tune.id!=='silent'&&<Button type="button" variant="outline" className="min-h-11" aria-label={`${playing===tune.id?'Stop':'Preview'} ${tune.name}`} onClick={()=>void preview(tune.id)}>{playing===tune.id?<Square aria-hidden="true"/>:<Play aria-hidden="true"/>}{playing===tune.id?'Stop':'Preview'}</Button>}
  </div>)}</fieldset>
  <div className="flex items-center gap-3"><label htmlFor="ringtone-volume" className="text-sm">Volume</label><input id="ringtone-volume" type="range" className="min-w-0 flex-1 accent-primary" min="0" max="100" value={selected.volume} onChange={event=>{const volume=Number(event.target.value);setDraft({...selected,volume});if(player.current)player.current.audio.volume=volume/100;}}/><output htmlFor="ringtone-volume" className="w-10 text-sm tabular-nums">{selected.volume}%</output></div>
  <Button type="button" className="min-h-11" onClick={()=>{stop();try{saveRingtonePreference(userId,selected);setMessage('Call tune saved.');setDraft(null);}catch{setMessage('Browser storage is unavailable. Your preference could not be saved.');}}}>Save call tune</Button>
  <p className="text-xs text-muted-foreground">Four original instrumental tunes, free to use.</p>
  {message&&<p role="status" className="text-sm">{message}</p>}
 </section>;
}
