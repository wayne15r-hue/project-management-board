// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import type {AudioCall} from '@/types/calls';
const media=vi.hoisted(()=>({connect:vi.fn(),disconnect:vi.fn(),microphone:vi.fn(),remotes:new Map(),handlers:new Map<string,(...args:unknown[])=>void>()}));
vi.mock('livekit-client',()=>({
 Track:{Kind:{Audio:'audio',Video:'video'},Source:{Microphone:'microphone',Camera:'camera',ScreenShare:'screen_share',ScreenShareAudio:'screen_share_audio'}},
 RoomEvent:{TrackSubscribed:'track',TrackUnsubscribed:'untrack',Reconnecting:'reconnecting',Reconnected:'reconnected',Disconnected:'disconnected',ActiveSpeakersChanged:'speakers',ParticipantConnected:'joined',ParticipantDisconnected:'left',LocalTrackPublished:'localPublished',LocalTrackUnpublished:'localUnpublished',TrackMuted:'muted',TrackUnmuted:'unmuted',ConnectionQualityChanged:'quality',AudioPlaybackStatusChanged:'playback'},
 Room:class {
  connect=media.connect;disconnect=media.disconnect;remoteParticipants=media.remotes;localParticipant={identity:'session',trackPublications:new Map(),publishTrack:async()=>({}),unpublishTrack:async()=>({})};canPlaybackAudio=true;
  on(name:string,handler:(...args:unknown[])=>void){media.handlers.set(name,handler);return this;}
  switchActiveDevice=async()=>{};startAudio=async()=>{};
 }
}));
import {AudioRoom} from '@/components/calls/audio-room';
const call:AudioCall={id:'call',conversation_id:'conv',caller_id:'me',caller_name:'Me',title:'QA audio',kind:'direct',state:'active',end_reason:null,created_at:'2026-11-02',started_at:'2026-11-02',ended_at:null,current_user_is_admin:true,participants:[{user_id:'me',media_identity:'session',display_name:'Me',state:'joined',blocked:false,heartbeat_at:'2026-11-02'}]};
beforeEach(()=>{media.remotes.clear();media.handlers.clear();media.connect.mockReset().mockResolvedValue(undefined);media.disconnect.mockReset();const microphoneTrack={kind:'audio',stop:vi.fn(),addEventListener:vi.fn()};media.microphone.mockReset().mockResolvedValue({getTracks:()=>[microphoneTrack]});Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:media.microphone,enumerateDevices:async()=>[]}});vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({token:'synthetic-token',url:'wss://qa.livekit.cloud',capabilities:{video:true,screenShare:true}}))));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('connects muted, explains denied microphone access, and lets the user retry',async()=>{
 media.microphone.mockRejectedValueOnce(new DOMException('Denied','NotAllowedError'));
 render(<AudioRoom call={call} currentUserId="me" onLeave={()=>{}} onKick={()=>{}}/>);
 await screen.findByText('Connected');expect(media.microphone).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Unmute microphone'}));await screen.findByRole('alert');
 expect(screen.getByRole('alert').textContent).toContain('Microphone access was denied');
 fireEvent.click(screen.getByRole('button',{name:'Unmute microphone'}));await screen.findByRole('button',{name:'Mute microphone'});
});
it('disconnects and removes remote audio when the component unmounts',async()=>{
 const view=render(<AudioRoom call={call} currentUserId="me" onLeave={()=>{}} onKick={()=>{}}/>);await screen.findByText('Connected');
 const audio=document.createElement('audio');const track={kind:'audio',attach:()=>audio,detach:()=>[audio]};
 act(()=>media.handlers.get('track')!(track));expect(view.container.contains(audio)).toBe(true);
 view.unmount();expect(document.contains(audio)).toBe(false);expect(media.disconnect).toHaveBeenCalled();
});
it('ignores late token delivery after leaving instead of opening another media connection',async()=>{
 let resolve!:(value:Response)=>void;vi.stubGlobal('fetch',()=>new Promise<Response>(r=>{resolve=r;}));
 const view=render(<AudioRoom call={call} currentUserId="me" onLeave={()=>{}} onKick={()=>{}}/>);view.unmount();
 await act(async()=>resolve(new Response(JSON.stringify({token:'late',url:'wss://qa.livekit.cloud'}))));
 await waitFor(()=>expect(media.connect).not.toHaveBeenCalled());
});
it('keeps one room connected when compacting or changing page content and stops tracks on terminal disconnect',async()=>{
 const props={call,currentUserId:'me',onLeave:()=>{},onKick:()=>{}};
 const view=render(<AudioRoom {...props} expanded/>);await screen.findByText('Connected');
 fireEvent.click(screen.getByRole('button',{name:'Unmute microphone'}));await screen.findByRole('button',{name:'Mute microphone'});
 view.rerender(<AudioRoom {...props} expanded={false}/>);expect(media.connect).toHaveBeenCalledTimes(1);expect(media.disconnect).not.toHaveBeenCalled();
 act(()=>media.handlers.get('reconnecting')!());act(()=>media.handlers.get('reconnected')!());expect(screen.getByRole('button',{name:'Mute microphone'})).toBeTruthy();
 act(()=>media.handlers.get('disconnected')!());await screen.findByRole('button',{name:'Unmute microphone'});
 expect((await media.microphone.mock.results[0].value).getTracks()[0].stop).toHaveBeenCalled();
});
it('retains the first presentation and the viewer selection when concurrent presenters arrive',async()=>{
 const screenTrack=()=>({attach:vi.fn(),detach:vi.fn(),kind:'video'});
 const first=screenTrack();const second=screenTrack();
 const participant=(identity:string,track:unknown)=>({identity,trackPublications:new Map([['share',{source:'screen_share',track,isMuted:false}]])});
 const extended={...call,participants:[...call.participants,{...call.participants[0],user_id:'one',media_identity:'one',display_name:'One'},{...call.participants[0],user_id:'two',media_identity:'two',display_name:'Two'}]};
 render(<AudioRoom call={extended} currentUserId="me" onLeave={()=>{}} onKick={()=>{}}/>);await screen.findByText('Connected');
 media.remotes.set('two',participant('two',second));act(()=>media.handlers.get('joined')!());await screen.findByText('Two is presenting');
 media.remotes.set('one',participant('one',first));act(()=>media.handlers.get('joined')!());expect(screen.getByText('Two is presenting')).toBeTruthy();
 fireEvent.change(screen.getByRole('combobox',{name:'Select presentation'}),{target:{value:'one'}});expect(screen.getByText('One is presenting')).toBeTruthy();
 act(()=>media.handlers.get('quality')!());expect(screen.getByText('One is presenting')).toBeTruthy();
 media.remotes.delete('one');act(()=>media.handlers.get('left')!());expect(screen.getByText('Two is presenting')).toBeTruthy();
});
it('starts screen capture in the click handler with audio off and leaves cancellation unchanged',async()=>{
 const display=vi.fn().mockRejectedValue(new DOMException('cancel','NotAllowedError'));
 Object.assign(navigator.mediaDevices,{getDisplayMedia:display,getSupportedConstraints:()=>({})});
 render(<AudioRoom call={call} currentUserId="me" onLeave={()=>{}} onKick={()=>{}}/>);await screen.findByText('Connected');
 fireEvent.click(screen.getByRole('button',{name:'Share screen'}));expect(display).toHaveBeenCalledWith(expect.objectContaining({audio:false,selfBrowserSurface:'exclude',systemAudio:'exclude'}));
 await waitFor(()=>expect(screen.getByRole('button',{name:'Share screen'})).toBeTruthy());expect(screen.queryByRole('alert')).toBeNull();expect(media.disconnect).not.toHaveBeenCalled();
});
it('plays each remote audio track only once and detaches it on terminal disconnect',async()=>{
 render(<AudioRoom call={call} currentUserId="me" onLeave={()=>{}} onKick={()=>{}}/>);await screen.findByText('Connected');
 const element=document.createElement('audio');const track={kind:'audio',attach:vi.fn(()=>element),detach:vi.fn(()=>[element])};
 act(()=>{media.handlers.get('track')!(track);media.handlers.get('track')!(track);});expect(track.attach).toHaveBeenCalledTimes(1);
 act(()=>media.handlers.get('disconnected')!());expect(document.contains(element)).toBe(false);
});
