// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {readRingtonePreference,saveRingtonePreference,DEFAULT_RINGTONE,createRingtoneAudio} from '@/lib/calls/ringtones';
import {useIncomingRingtone} from '@/components/calls/use-incoming-ringtone';
const players: {src:string;volume:number;loop:boolean;play:ReturnType<typeof vi.fn>;pause:ReturnType<typeof vi.fn>;currentTime:number}[]=[];
let denied=false;const held=new Set<string>();
beforeEach(()=>{localStorage.clear();players.length=0;denied=false;held.clear();
 vi.stubGlobal('Audio',class{src:string;volume=1;loop=false;currentTime=0;play=vi.fn(()=>denied?Promise.reject(new DOMException('blocked','NotAllowedError')):Promise.resolve());pause=vi.fn();constructor(src:string){this.src=src;players.push(this);}});
 Object.defineProperty(navigator,'locks',{configurable:true,value:{request:async(name:string,_options:unknown,callback:(lock:object|null)=>Promise<void>)=>{if(held.has(name))return callback(null);held.add(name);try{await callback({});}finally{held.delete(name);}}}});
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.useRealTimers();});
it('validates preferences and keeps different accounts separate',()=>{
 expect(readRingtonePreference('a')).toEqual(DEFAULT_RINGTONE);
 saveRingtonePreference('a',{tune:'warm-keys',volume:23});expect(readRingtonePreference('a')).toEqual({tune:'warm-keys',volume:23});expect(readRingtonePreference('b')).toEqual(DEFAULT_RINGTONE);
 localStorage.setItem('helios:ringtone:a','{"tune":"https://bad.test","volume":500}');expect(readRingtonePreference('a')).toEqual(DEFAULT_RINGTONE);
 localStorage.setItem('helios:ringtone:a','not-json');expect(readRingtonePreference('a')).toEqual(DEFAULT_RINGTONE);
});
function Harness({user='a',call='call',eligible=true,tune='dawn-chimes',volume=45}:{user?:string;call?:string|null;eligible?:boolean;tune?:'dawn-chimes'|'warm-keys'|'silent';volume?:number}){
 const value=useIncomingRingtone({userId:user,incomingCallId:call,eligible,preference:{tune,volume}});return <button onClick={()=>void value.enableSound()}>{value.blocked?'Enable ringtone':'Sound ready'}</button>;
}
it('plays a local loop at the chosen volume and stops on terminal eligibility loss',async()=>{
 const view=render(<Harness/>);await waitFor(()=>expect(players[0]?.play).toHaveBeenCalled());expect(players[0].src).toBe('/audio/ringtones/dawn-chimes.wav');expect(players[0].loop).toBe(true);expect(players[0].volume).toBe(.45);
 view.rerender(<Harness eligible={false}/>);expect(players[0].pause).toHaveBeenCalled();
});
it('does not play for no invitation, Silent or zero volume',async()=>{
 const view=render(<Harness call={null}/>);await act(async()=>{});expect(players).toHaveLength(0);
 view.rerender(<Harness tune="silent"/>);await act(async()=>{});expect(players).toHaveLength(0);
 view.rerender(<Harness volume={0}/>);await act(async()=>{});expect(players).toHaveLength(0);
});
it('deduplicates tabs and releases ownership on unmount so another tab can ring',async()=>{
 const first=render(<Harness/>);await waitFor(()=>expect(players).toHaveLength(1));
 const second=render(<Harness/>);await act(async()=>{});expect(players).toHaveLength(1);
 first.unmount();await act(async()=>{});expect(held.size).toBe(0);
 second.rerender(<Harness tune="warm-keys"/>);await waitFor(()=>expect(players).toHaveLength(2));expect(players[0].pause).toHaveBeenCalled();
});
it('does not repeatedly retry blocked autoplay and allows a user gesture to recover',async()=>{
 denied=true;render(<Harness/>);await screen.findByRole('button',{name:'Enable ringtone'});expect(players).toHaveLength(1);
 denied=false;fireEvent.click(screen.getByRole('button',{name:'Enable ringtone'}));await screen.findByRole('button',{name:'Sound ready'});expect(players.at(-1)?.play).toHaveBeenCalled();
});
it('stops old account audio on identity switch and never leaves audio after unmount',async()=>{
 const view=render(<Harness/>);await waitFor(()=>expect(players).toHaveLength(1));view.rerender(<Harness user="b"/>);await waitFor(()=>expect(players).toHaveLength(2));expect(players[0].pause).toHaveBeenCalled();view.unmount();expect(players[1].pause).toHaveBeenCalled();
});
it('gives incoming ringing priority over Settings previews so a preview cannot strand the invitation silent',async()=>{
 render(<Harness/>);await waitFor(()=>expect(players[0]?.play).toHaveBeenCalled());
 expect(()=>createRingtoneAudio({tune:'warm-keys',volume:30},false)).toThrow(/incoming call/i);expect(players[0].pause).not.toHaveBeenCalled();
});
it('clears blocked state after explicit playback succeeds without Web Locks',async()=>{
 Object.defineProperty(navigator,'locks',{configurable:true,value:undefined});render(<Harness/>);await screen.findByRole('button',{name:'Enable ringtone'});
 fireEvent.click(screen.getByRole('button',{name:'Enable ringtone'}));await screen.findByRole('button',{name:'Sound ready'});expect(players[0].loop).toBe(false);
});
