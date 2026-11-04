import {Track} from 'livekit-client';

export type CaptureKind='microphone'|'camera'|'screen';
type Publisher={publishTrack:(track:MediaStreamTrack,options:{source:Track.Source})=>Promise<unknown>;unpublishTrack:(track:MediaStreamTrack)=>Promise<unknown>};

// Own browser captures independently of React and SDK reconnection. Closing is synchronous.
export class MediaSession {
 private active=true;
 private captures=new Map<CaptureKind,MediaStreamTrack[]>();
 private pending=new Set<CaptureKind>();
 screenAudio=false;
 constructor(private publisher:Publisher,private changed:()=>void){}
 has(kind:CaptureKind){return this.captures.has(kind);}
 stop(kind:CaptureKind){
  const tracks=this.captures.get(kind);this.captures.delete(kind);
  if(kind==='screen')this.screenAudio=false;
  tracks?.forEach(track=>{track.stop();void this.publisher.unpublishTrack(track).catch(()=>{});});
  this.changed();
 }
 close(){this.active=false;for(const kind of this.captures.keys())this.stop(kind);}
 async capture(kind:CaptureKind,acquire:()=>Promise<MediaStream>,includeAudio=false){
  if(!this.active||this.pending.has(kind)||this.has(kind))return;
  this.pending.add(kind);let tracks:MediaStreamTrack[]=[];
  try{
   // No await precedes acquire: getDisplayMedia retains the click's transient activation.
   const stream=await acquire();tracks=stream.getTracks();
   if(!this.active){tracks.forEach(t=>t.stop());return;}
   if(kind==='screen'){
    const video=stream.getVideoTracks()[0];
    if(!video)throw new Error('No screen video was returned. Try sharing another tab or window.');
    const browserTab=video.getSettings().displaySurface==='browser';
    tracks=tracks.filter(track=>{
     if(track.kind!=='audio')return true;
     const settings=track.getSettings() as MediaTrackSettings & {restrictOwnAudio?:boolean;suppressLocalAudioPlayback?:boolean};
     const safe=includeAudio&&browserTab&&settings.restrictOwnAudio===true&&settings.suppressLocalAudioPlayback===true;
     if(!safe)track.stop();return safe;
    });
    this.screenAudio=tracks.some(t=>t.kind==='audio');
   }
   this.captures.set(kind,tracks);
   for(const track of tracks){
    track.addEventListener('ended',()=>this.stop(kind),{once:true});
    const source=kind==='microphone'?Track.Source.Microphone:kind==='camera'?Track.Source.Camera:track.kind==='audio'?Track.Source.ScreenShareAudio:Track.Source.ScreenShare;
    await this.publisher.publishTrack(track,{source});
    if(!this.active||this.captures.get(kind)!==tracks){track.stop();await this.publisher.unpublishTrack(track);return;}
   }
   this.changed();
  }catch(error){
   tracks.forEach(track=>track.stop());this.stop(kind);throw error;
  }finally{this.pending.delete(kind);}
 }
}
