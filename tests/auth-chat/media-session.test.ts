import {expect,it,vi} from 'vitest';
import {MediaSession} from '@/lib/calls/media-session';
function track(kind='video',settings:Record<string,unknown>={}){
 const listeners=new Map<string,()=>void>();
 return {kind,stop:vi.fn(),getSettings:()=>settings,addEventListener:(event:string,fn:()=>void)=>listeners.set(event,fn),end:()=>listeners.get('ended')?.()} as unknown as MediaStreamTrack & {end:()=>void};
}
const stream=(tracks:MediaStreamTrack[])=>({getTracks:()=>tracks,getVideoTracks:()=>tracks.filter(t=>t.kind==='video'),getAudioTracks:()=>tracks.filter(t=>t.kind==='audio')}) as MediaStream;
function setup(){const participant={publishTrack:vi.fn(async()=>({})),unpublishTrack:vi.fn(async()=>({}))};return {participant,session:new MediaSession(participant,()=>{})};}
it('stops a camera permission result delivered after leaving and never publishes it',async()=>{
 const {session,participant}=setup();let resolve!:(s:MediaStream)=>void;const camera=track();
 const pending=session.capture('camera',()=>new Promise<MediaStream>(r=>{resolve=r;}));session.close();resolve(stream([camera]));await pending;
 expect(camera.stop).toHaveBeenCalled();expect(participant.publishTrack).not.toHaveBeenCalled();
});
it('stops both screen tracks on browser Stop Sharing and permits another fresh share',async()=>{
 const {session,participant}=setup();const video=track('video',{displaySurface:'browser'});const audio=track('audio',{restrictOwnAudio:true,suppressLocalAudioPlayback:true});
 await session.capture('screen',()=>Promise.resolve(stream([video,audio])),true);
 expect(participant.publishTrack).toHaveBeenCalledTimes(2);video.end();
 expect(audio.stop).toHaveBeenCalled();expect(session.has('screen')).toBe(false);
 await session.capture('screen',()=>Promise.resolve(stream([track()])));expect(session.has('screen')).toBe(true);session.close();
});
it('falls back to screen-only when audio isolation or browser-tab capture cannot be verified',async()=>{
 const {session,participant}=setup();const audio=track('audio');
 await session.capture('screen',()=>Promise.resolve(stream([track('video',{displaySurface:'monitor'}),audio])),true);
 expect(audio.stop).toHaveBeenCalled();expect(participant.publishTrack).toHaveBeenCalledTimes(1);expect(session.screenAudio).toBe(false);session.close();
});
it('stops late publication and discards concurrent screen requests',async()=>{
 const {session,participant}=setup();let resolve!:()=>void;participant.publishTrack.mockImplementationOnce(()=>new Promise(r=>{resolve=()=>r({});}));
 const video=track();const first=session.capture('screen',()=>Promise.resolve(stream([video])));
 await Promise.resolve();const second=vi.fn();await session.capture('screen',second);expect(second).not.toHaveBeenCalled();
 session.close();resolve();await first;expect(video.stop).toHaveBeenCalled();expect(participant.unpublishTrack).toHaveBeenCalled();
});
it('cleans acquired tracks on publication failure without disabling the microphone',async()=>{
 const {session,participant}=setup();const mic=track('audio');await session.capture('microphone',()=>Promise.resolve(stream([mic])));
 participant.publishTrack.mockRejectedValueOnce(new Error('Camera failed'));const camera=track();
 await expect(session.capture('camera',()=>Promise.resolve(stream([camera])))).rejects.toThrow('Camera failed');
 expect(camera.stop).toHaveBeenCalled();expect(mic.stop).not.toHaveBeenCalled();session.close();expect(mic.stop).toHaveBeenCalled();
});
