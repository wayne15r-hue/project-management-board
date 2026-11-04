"use client";
import {useCallback,useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {createRingtoneAudio,DEFAULT_RINGTONE,parseRingtonePreference,preferenceKey,RINGTONE_EVENT,type RingtonePreference} from '@/lib/calls/ringtones';

const serverSnapshot=()=>JSON.stringify(DEFAULT_RINGTONE);
function subscribe(listener:()=>void){window.addEventListener('storage',listener);window.addEventListener(RINGTONE_EVENT,listener);return()=>{window.removeEventListener('storage',listener);window.removeEventListener(RINGTONE_EVENT,listener);};}
export function useRingtonePreference(userId:string){
 const snapshot=useCallback(()=>{try{return localStorage.getItem(preferenceKey(userId))||serverSnapshot();}catch{return serverSnapshot();}},[userId]);
 return parseRingtonePreference(useSyncExternalStore(subscribe,snapshot,serverSnapshot));
}

export function useIncomingRingtone({userId,incomingCallId,eligible,preference}:{userId:string;incomingCallId:string|null;eligible:boolean;preference:RingtonePreference}){
 const key=eligible&&incomingCallId&&preference.tune!=='silent'&&preference.volume>0?`${userId}:${incomingCallId}:${preference.tune}:${preference.volume}`:null;
 const [blockedKey,setBlockedKey]=useState<string|null>(null);
 const [attempt,setAttempt]=useState(0);
 const manual=useRef(false);
 const stopRef=useRef(()=>{});
 useEffect(()=>{
  if(!key)return;
  let disposed=false,acquiring=false,blocked=false;
  let release:(()=>void)|undefined;
  let player:ReturnType<typeof createRingtoneAudio>|undefined;
  const stop=()=>{disposed=true;player?.stop();release?.();};stopRef.current=stop;
  const play=async()=>{
   if(disposed)return;
   player=createRingtoneAudio(preference,true);
   try{await player.audio.play();if(disposed)player.stop();else setBlockedKey(null);}
   catch{player.stop();if(!disposed){blocked=true;setBlockedKey(key);}release?.();}
  };
  const acquire=()=>{
   if(disposed||acquiring||blocked)return;
   if(!navigator.locks){
    // Without atomic tab ownership, only an explicit, non-looping audition is safe.
    if(manual.current){manual.current=false;blocked=true;player=createRingtoneAudio(preference,false,true);player.audio.onended=()=>{player?.stop();if(!disposed)setBlockedKey(key);};void player.audio.play().then(()=>{if(disposed)player?.stop();else setBlockedKey(null);}).catch(()=>{player?.stop();if(!disposed)setBlockedKey(key);});}
    else {blocked=true;setBlockedKey(key);}return;
   }
   acquiring=true;
   void navigator.locks.request(`helios:ringtone-owner:${userId}`,{ifAvailable:true},async lock=>{
    if(!lock||disposed)return;
    await new Promise<void>(resolve=>{release=resolve;void play();});
   }).catch(()=>{if(!disposed){blocked=true;setBlockedKey(key);}}).finally(()=>{acquiring=false;});
  };
  // Defers playback until this effect has installed its cleanup (Strict Mode safe).
  void Promise.resolve().then(acquire);
  const timer=window.setInterval(acquire,1000);
  const pagehide=()=>stop();window.addEventListener('pagehide',pagehide);
  return()=>{window.clearInterval(timer);window.removeEventListener('pagehide',pagehide);stop();if(stopRef.current===stop)stopRef.current=()=>{};};
  // Preference scalars are encoded in key; changing them retires the old player.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[key,attempt]);
 const stop=useCallback(()=>stopRef.current(),[]);
 const enableSound=useCallback(async()=>{manual.current=true;setAttempt(value=>value+1);},[]);
 return {blocked:!!key&&blockedKey===key,enableSound,stop};
}
