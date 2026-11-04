export const RINGTONES = [
  {id:'dawn-chimes',name:'Dawn Chimes',description:'A bright, gently rising chime.'},
  {id:'warm-keys',name:'Warm Keys',description:'A soft, unhurried keyboard phrase.'},
  {id:'soft-marimba',name:'Soft Marimba',description:'A light, rounded wooden melody.'},
  {id:'orbit-bells',name:'Orbit Bells',description:'A mellow pair of repeating bell phrases.'},
] as const;
export type RingtoneId = typeof RINGTONES[number]['id'] | 'silent';
export type RingtonePreference = {tune:RingtoneId;volume:number};
export const DEFAULT_RINGTONE:RingtonePreference={tune:'dawn-chimes',volume:45};
export const RINGTONE_EVENT='helios:ringtone-change';
export const preferenceKey=(userId:string)=>`helios:ringtone:${userId}`;
export function parseRingtonePreference(raw:string|null):RingtonePreference {
  try {
    const value=JSON.parse(raw||'null');
    if(value && (value.tune==='silent'||RINGTONES.some(t=>t.id===value.tune)) && typeof value.volume==='number' && Number.isFinite(value.volume))
      return {tune:value.tune,volume:Math.round(Math.max(0,Math.min(100,value.volume)))};
  } catch { /* Invalid preferences fall back to a known local tune. */ }
  return DEFAULT_RINGTONE;
}
export function readRingtonePreference(userId:string):RingtonePreference {
  try {return parseRingtonePreference(localStorage.getItem(preferenceKey(userId)));} catch {return DEFAULT_RINGTONE;}
}
export function saveRingtonePreference(userId:string,value:RingtonePreference) {
  localStorage.setItem(preferenceKey(userId),JSON.stringify(parseRingtonePreference(JSON.stringify(value))));
  window.dispatchEvent(new Event(RINGTONE_EVENT));
}

let activeAudio:HTMLAudioElement|null=null;
let activeIncoming=false;
export const RINGTONE_PLAYBACK_EVENT='helios:ringtone-playback';
/** A single audible ringtone/preview per document. Never attached to media tracks. */
export function stopRingtoneAudio(){activeAudio?.pause();if(activeAudio)activeAudio.currentTime=0;activeAudio=null;activeIncoming=false;window.dispatchEvent(new Event(RINGTONE_PLAYBACK_EVENT));}
export function createRingtoneAudio(preference:RingtonePreference,loop:boolean,incoming=loop){
  if(activeIncoming&&!incoming)throw new Error('An incoming call is ringing. Answer or decline before previewing a tune.');
  stopRingtoneAudio();
  const audio=new Audio(`/audio/ringtones/${preference.tune}.wav`);audio.volume=preference.volume/100;audio.loop=loop;activeAudio=audio;activeIncoming=incoming;
  return {audio,stop:()=>{audio.pause();audio.currentTime=0;if(activeAudio===audio){activeAudio=null;activeIncoming=false;}}};
}
