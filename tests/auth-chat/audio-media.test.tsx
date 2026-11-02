// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import type {AudioCall} from '@/types/calls';
const media=vi.hoisted(()=>({connect:vi.fn(),disconnect:vi.fn(),microphone:vi.fn(),handlers:new Map<string,(...args:unknown[])=>void>()}));
vi.mock('livekit-client',()=>({
 Track:{Kind:{Audio:'audio'}},
 RoomEvent:{TrackSubscribed:'track',TrackUnsubscribed:'untrack',Reconnecting:'reconnecting',Reconnected:'reconnected',Disconnected:'disconnected',ActiveSpeakersChanged:'speakers',ParticipantConnected:'joined',ParticipantDisconnected:'left'},
 Room:class {
  connect=media.connect;disconnect=media.disconnect;remoteParticipants=new Map();localParticipant={identity:'session',setMicrophoneEnabled:media.microphone};
  on(name:string,handler:(...args:unknown[])=>void){media.handlers.set(name,handler);return this;}
  switchActiveDevice=async()=>{};startAudio=async()=>{};
 }
}));
import {AudioRoom} from '@/components/calls/audio-room';
const call:AudioCall={id:'call',conversation_id:'conv',caller_id:'me',caller_name:'Me',title:'QA audio',kind:'direct',state:'active',end_reason:null,created_at:'2026-11-02',started_at:'2026-11-02',ended_at:null,current_user_is_admin:true,participants:[{user_id:'me',media_identity:'session',display_name:'Me',state:'joined',blocked:false,heartbeat_at:'2026-11-02'}]};
beforeEach(()=>{media.handlers.clear();media.connect.mockReset().mockResolvedValue(undefined);media.disconnect.mockReset();media.microphone.mockReset().mockResolvedValue(undefined);vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({token:'synthetic-token',url:'wss://qa.livekit.cloud'}))));});
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
