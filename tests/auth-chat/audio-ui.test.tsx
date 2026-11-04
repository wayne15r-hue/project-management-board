// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
vi.mock('next/dynamic',()=>({default:()=>({initialDevices,onLeave}:{initialDevices?:{microphone:boolean;camera:boolean};onLeave:()=>void})=><div><span data-testid="media-preferences">{JSON.stringify(initialDevices||{camera:false,microphone:false})}</span><button onClick={onLeave}>Leave test call</button></div>}));
import {CallProvider,CallControls} from '@/components/calls/call-provider';
const user='00000000-0000-4000-8000-000000000001';const other='00000000-0000-4000-8000-000000000002';
const conversation={id:'00000000-0000-4000-8000-000000000003',type:'direct' as const};
const call={id:'00000000-0000-4000-8000-000000000004',conversation_id:conversation.id,caller_id:other,caller_name:'QA caller',title:'QA chat',kind:'direct',state:'ringing',participants:[{user_id:user,state:'invited',blocked:false},{user_id:other,state:'joined',blocked:false}]};
const response=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.useRealTimers();});
it('shows incoming calls across dashboard pages and declines without requesting media',async()=>{
 let calls=[call];vi.stubGlobal('fetch',vi.fn(async(_url:string,init?:RequestInit)=>{
  if(init?.method==='PATCH'){calls=[];return response({call:{...call,state:'ended',end_reason:'declined'}});}return response({calls,ready:true});
 }));
 render(<CallProvider currentUserId={user}><div>Board page</div></CallProvider>);
 await screen.findByText('Incoming audio call');fireEvent.click(screen.getByRole('button',{name:'Decline'}));
 await waitFor(()=>expect(screen.queryByText('Incoming audio call')).toBeNull());expect(screen.getByText('Board page')).toBeTruthy();
});
it('keeps controls retryable when starting a call fails',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(_url:string,init?:RequestInit)=>init?.method==='POST'?response({error:'Calling service unavailable'},503):response({calls:[],ready:true})));
 render(<CallProvider currentUserId={user}><CallControls conversation={conversation}/></CallProvider>);
 const button=await screen.findByRole('button',{name:'Start audio call'});await waitFor(()=>expect((button as HTMLButtonElement).disabled).toBe(false));fireEvent.click(button);
 await screen.findByRole('alert');expect(screen.getByRole('alert').textContent).toContain('Calling service unavailable');
 expect((button as HTMLButtonElement).disabled).toBe(false);
});
it('shows missed/cancelled call history from the selected conversation',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>response({calls:url.includes('conversationId=')?[{...call,state:'ended',end_reason:'missed',created_at:'2026-11-02T04:00:00Z',ended_at:'2026-11-02T04:00:45Z'}]:[],ready:true})));
 render(<CallProvider currentUserId={user}><CallControls conversation={conversation}/></CallProvider>);
 fireEvent.click(screen.getByRole('button',{name:'Call history'}));await screen.findByText(/Missed/);
});
it('requires explicit takeover in a new dashboard tab and does not heartbeat a call owned elsewhere',async()=>{
 const joined={...call,state:'active',participants:[{user_id:user,state:'joined',blocked:false,media_identity:'opaque-session'}]};
 const fetcher=vi.fn(async(url:string,init?:RequestInit)=>{void url;void init;return response({calls:[joined],ready:true});});vi.stubGlobal('fetch',fetcher);
 render(<CallProvider currentUserId={user}><div>Other dashboard tab</div></CallProvider>);
 await screen.findByText('Call active in another tab');expect(screen.getByRole('button',{name:'Continue call in this tab'})).toBeTruthy();
 vi.useFakeTimers();await act(async()=>{await vi.advanceTimersByTimeAsync(10001);});expect(fetcher.mock.calls.some(([,init])=>init?.method==='PATCH')).toBe(false);vi.useRealTimers();
 fireEvent.click(screen.getByRole('button',{name:'Continue call in this tab'}));
 await screen.findByText('Audio active in this tab');
});
it('opens video preview with devices off and cancels without starting a call',async()=>{
 const fetcher=vi.fn(async()=>response({calls:[],ready:true,videoReady:true}));vi.stubGlobal('fetch',fetcher);
 render(<CallProvider currentUserId={user}><CallControls conversation={conversation}/></CallProvider>);
 const video=await screen.findByRole('button',{name:'Start video call'});await waitFor(()=>expect((video as HTMLButtonElement).disabled).toBe(false));fireEvent.click(video);
 await screen.findByRole('dialog',{name:'Video call preview'});expect(screen.getByText('Camera off')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Cancel preview'}));expect(fetcher.mock.calls.every((args:unknown[])=>!(args[1] as RequestInit)?.method)).toBe(true);
 fireEvent.click(video);fireEvent.click(await screen.findByRole('button',{name:'Join without camera'}));
 await waitFor(()=>expect(fetcher.mock.calls.some((args:unknown[])=>JSON.parse((args[1] as RequestInit)?.body as string||'{}').mode==='video')).toBe(true));
});
it('requires preview before accepting an incoming video call',async()=>{
 const fetcher=vi.fn(async()=>response({calls:[{...call,initialMode:'video'}],ready:true,videoReady:true}));vi.stubGlobal('fetch',fetcher);
 render(<CallProvider currentUserId={user}><div>Dashboard</div></CallProvider>);
 await screen.findByText('Incoming video call');fireEvent.click(screen.getByRole('button',{name:'Accept'}));
 await screen.findByRole('dialog',{name:'Video call preview'});expect(fetcher.mock.calls.every((args:unknown[])=>!(args[1] as RequestInit)?.method)).toBe(true);
});
it('closes preview capture when call status becomes untrusted',async()=>{
 const fetcher=vi.fn(async()=>response({calls:[],ready:true,videoReady:true}));vi.stubGlobal('fetch',fetcher);
 render(<CallProvider currentUserId={user}><CallControls conversation={conversation}/></CallProvider>);
 await waitFor(()=>expect((screen.getByRole('button',{name:'Start video call'}) as HTMLButtonElement).disabled).toBe(false));
 fireEvent.click(screen.getByRole('button',{name:'Start video call'}));await screen.findByRole('dialog');
 fetcher.mockRejectedValue(new Error('Session lost'));const now=Date.now();const clock=vi.spyOn(Date,'now').mockReturnValue(now+31001);
 fireEvent(window,new Event('online'));await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());clock.mockRestore();
});
it('clears preview device choices before retrying a failed leave in a new media session',async()=>{
 const track={stop:vi.fn(),addEventListener:vi.fn()};
 Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{enumerateDevices:async()=>[],getUserMedia:async()=>({getTracks:()=>[track]})}});
 const joined={...call,caller_id:user,state:'active',initialMode:'video',participants:[{user_id:user,state:'joined',blocked:false,media_identity:'own'}]};let calls:unknown[]=[];
 vi.stubGlobal('fetch',vi.fn(async(_url:string,init?:RequestInit)=>{
  if(init?.method==='POST'){calls=[joined];return response({call:joined});}
  if(init?.method==='PATCH')return response({error:'Leave failed'},503);
  return response({calls,ready:true,videoReady:true});
 }));
 render(<CallProvider currentUserId={user}><CallControls conversation={conversation}/></CallProvider>);
 await waitFor(()=>expect((screen.getByRole('button',{name:'Start video call'}) as HTMLButtonElement).disabled).toBe(false));fireEvent.click(screen.getByRole('button',{name:'Start video call'}));
 fireEvent.click(await screen.findByRole('button',{name:'Enable preview microphone'}));await screen.findByText('Microphone on');
 fireEvent.click(screen.getByRole('button',{name:'Join without camera'}));await waitFor(()=>expect(screen.getByTestId('media-preferences').textContent).toContain('"microphone":true'));
 fireEvent.click(screen.getByRole('button',{name:'Leave test call'}));await screen.findByText(/Leave failed/);fireEvent.click(screen.getByRole('button',{name:'Retry connection'}));
 await waitFor(()=>expect(screen.getByTestId('media-preferences').textContent).toBe('{"camera":false,"microphone":false}'));
});
