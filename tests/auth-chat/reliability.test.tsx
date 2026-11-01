// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Conversation, Message } from '@/types/chat';
const events = vi.hoisted(() => [] as { table: string; event: string; callback: (payload: unknown) => void }[]);
const subscriptions = vi.hoisted(() => [] as ((status:string)=>void)[]);
vi.mock('@/lib/supabase/client', () => ({ createClient: () => {
  const query = { select: () => query, eq: async () => ({ data: [] }) };
  const channel = { on: (_: string, filter: {table:string;event:string}, callback: (payload:unknown)=>void) => { events.push({...filter,callback}); return channel; }, subscribe: (cb?:(status:string)=>void) => { if(cb) subscriptions.push(cb); return channel; }, track: async () => undefined, presenceState: () => ({}) };
  return { from: () => query, channel: () => channel, removeChannel: () => undefined };
} }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
import { MessageThread } from '@/components/chat/message-thread';
import { ChatShell } from '@/components/chat/chat-shell';
const user = { id:'u', full_name:'User', email:'u@example.test', avatar_url:null };
const conversation:Conversation = { id:'a', name:'QA isolated', type:'direct', board_id:null, created_by:'u', created_at:'2026-11-01', updated_at:'2026-11-01', last_message_at:null, members:[user], last_message:null, unread_count:0, current_user_is_admin:false };
const message:Message = { id:'m', conversation_id:'a', sender_id:'u', content:'Reaction fixture', message_type:'text', file_url:null, file_name:null, file_size:null, file_type:null, reply_to_id:null, edited_at:null, created_at:'2026-11-01T00:00:00Z', sender:user, reactions:[{emoji:'👍',count:1,user_ids:['other']}] };
const props = { conversation, currentUser:user, onBack:vi.fn(), onMessageSent:vi.fn(), onDelete:vi.fn() };
const json = (value:unknown, status=200) => new Response(JSON.stringify(value),{status});
beforeEach(() => { events.length=0; subscriptions.length=0; vi.clearAllMocks(); vi.spyOn(document,'visibilityState','get').mockReturnValue('visible'); vi.stubGlobal('requestAnimationFrame',(cb:()=>void)=>{cb();return 1;}); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('retains the draft and attachment when the text POST fails, without uploading the file', async () => {
  const fetcher=vi.fn(async(url:string,init?:RequestInit)=>json(url.endsWith('/read')?{}:init?.method==='POST'?{error:'Send failed'}:[], init?.method==='POST'&&!url.endsWith('/read')?500:200));
  vi.stubGlobal('fetch',fetcher);
  const view=render(<MessageThread {...props}/>);
  const input=screen.getByPlaceholderText('Write a message…') as HTMLTextAreaElement;
  fireEvent.change(input,{target:{value:'Keep my draft'}});
  fireEvent.change(view.container.querySelector('input[type=file]')!,{target:{files:[new File(['QA'],'qa.txt',{type:'text/plain'})]}});
  fireEvent.click(screen.getByRole('button',{name:'Send message'}));
  await waitFor(()=>expect((screen.getByRole('button',{name:'Send message'}) as HTMLButtonElement).disabled).toBe(false));
  expect(input.value).toBe('Keep my draft');
  expect(screen.getByText('qa.txt')).toBeTruthy();
  expect(fetcher.mock.calls.some(([url])=>url.endsWith('/upload'))).toBe(false);
});

it('retains the pending attachment when an upload returns an HTTP error', async () => {
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>json(url.endsWith('/upload')?{error:'Upload failed'}:url.endsWith('/read')?{}:[],url.endsWith('/upload')?500:200)));
  const view=render(<MessageThread {...props}/>);
  fireEvent.change(view.container.querySelector('input[type=file]')!,{target:{files:[new File(['QA'],'qa.txt',{type:'text/plain'})]}});
  fireEvent.click(screen.getByRole('button',{name:'Send message'}));
  await waitFor(()=>expect((screen.getByRole('button',{name:'Remove attachment'}) as HTMLButtonElement).disabled).toBe(false));
  expect(screen.getByText('qa.txt')).toBeTruthy();
  expect((screen.getByRole('button',{name:'Send message'}) as HTMLButtonElement).disabled).toBe(false);
});

it('retains a draft on a network error and permits a successful retry', async () => {
  let attempts=0;
  vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>{
    if(url.endsWith('/read')) return json({});
    if(init?.method==='POST') { if(++attempts===1) throw new Error('Offline'); return json({...message,content:'Retry this'}); }
    return json([]);
  }));
  render(<MessageThread {...props}/>);
  const input=screen.getByPlaceholderText('Write a message…') as HTMLTextAreaElement;
  fireEvent.change(input,{target:{value:'Retry this'}});
  fireEvent.click(screen.getByRole('button',{name:'Send message'}));
  await waitFor(()=>expect((screen.getByRole('button',{name:'Send message'}) as HTMLButtonElement).disabled).toBe(false));
  expect(input.value).toBe('Retry this');
  fireEvent.click(screen.getByRole('button',{name:'Send message'}));
  await screen.findByText('Retry this');
  await waitFor(()=>expect(input.value).toBe(''));
  expect(screen.getAllByText('Retry this')).toHaveLength(1);
});

it('keeps the server reaction when its realtime echo arrives before the HTTP result', async () => {
  let resolve!:(r:Response)=>void;
  const pending=new Promise<Response>(r=>{resolve=r;});
  vi.stubGlobal('fetch',vi.fn((url:string)=>url.endsWith('/reactions')?pending:Promise.resolve(json(url.endsWith('/read')?{}:[message]))));
  render(<MessageThread {...props}/>);
  await screen.findByText('Reaction fixture');
  fireEvent.click(screen.getByRole('button',{name:/👍\s*1/}));
  await act(async()=>events.find(e=>e.table==='message_reactions'&&e.event==='INSERT')!.callback({new:{message_id:'m',user_id:'u',emoji:'👍'}}));
  await act(async()=>resolve(json({action:'added',emoji:'👍'})));
  await waitFor(()=>expect(screen.getByRole('button',{name:/👍\s*2/})).toBeTruthy());
});

it('does not mark a hidden conversation read', async () => {
  vi.spyOn(document,'visibilityState','get').mockReturnValue('hidden');
  const fetcher=vi.fn(async(url:string)=>json(url.endsWith('/read')?{}:[message]));
  vi.stubGlobal('fetch',fetcher);
  render(<MessageThread {...props}/>);
  await screen.findByText('Reaction fixture');
  expect(fetcher.mock.calls.some(([url])=>url.endsWith('/read'))).toBe(false);
});

it('clears the conversation row unread count after its read request succeeds', async () => {
  let resolve!:(r:Response)=>void;
  const pending=new Promise<Response>(r=>{resolve=r;});
  let read=false;
  vi.stubGlobal('fetch',vi.fn((url:string)=>url==='/api/conversations'?Promise.resolve(json([{...conversation,unread_count:read?0:2}])):url.endsWith('/read')?pending.then(response=>{read=true;return response;}):Promise.resolve(json([message]))));
  render(<ChatShell currentUser={user}/>);
  const row=await screen.findByRole('button',{name:/QA isolated.*2/});
  expect(within(row).getByText('2')).toBeTruthy();
  await act(async()=>resolve(json({ok:true})));
  await waitFor(()=>expect(within(row).queryByText('2')).toBeNull());
});
it('recovers every missed page after a realtime reconnect',async()=>{
  const missed=Array.from({length:51},(_,i)=>({...message,id:`missed-${i}`,content:`Missed message ${i}`,created_at:`2026-11-01T00:01:${String(i).padStart(2,'0')}Z`}));
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>{
    if(url.endsWith('/read')) return json({});
    if(url.includes('after_id=missed-49')) return json(missed.slice(50));
    if(url.includes('after=')) return json(missed.slice(0,50));
    return json([message]);
  }));
  render(<MessageThread {...props}/>);
  await screen.findByText('Reaction fixture');
  await act(async()=>subscriptions.forEach(cb=>cb('SUBSCRIBED')));
  await screen.findByText('Missed message 50');
  expect(screen.getByText('Missed message 0')).toBeTruthy();
  expect(screen.getByText('Reaction fixture')).toBeTruthy();
});
it('does not skip a disconnected gap or mark it read when an HTTP send arrives later',async()=>{
  const missed=Array.from({length:60},(_,i)=>({...message,id:`gap-${i+1}`,content:`Gap ${i+1}`,created_at:new Date(Date.parse(message.created_at)+(i+1)*1000).toISOString()}));
  const own={...message,id:'own-later',content:'Sent while disconnected',created_at:'2026-11-01T00:02:00Z'};
  let resolve!:(response:Response)=>void;
  const firstPage=new Promise<Response>(r=>{resolve=r;});
  const reads:string[]=[];
  vi.stubGlobal('fetch',vi.fn((url:string,init?:RequestInit)=>{
    if(url.endsWith('/read')) { reads.push(JSON.parse(String(init?.body||'{}')).message_id); return Promise.resolve(json({})); }
    if(init?.method==='POST') return Promise.resolve(json(own));
    if(url.includes('after_id=m&')) return firstPage;
    if(url.includes('after_id=gap-50')) return Promise.resolve(json([...missed.slice(50),own]));
    if(url.includes('after=')) return Promise.resolve(json([]));
    return Promise.resolve(json([message]));
  }));
  render(<MessageThread {...props}/>);
  await screen.findByText('Reaction fixture');
  fireEvent.change(screen.getByPlaceholderText('Write a message…'),{target:{value:own.content}});
  fireEvent.click(screen.getByRole('button',{name:'Send message'}));
  await screen.findByText(own.content);
  await act(async()=>subscriptions.forEach(cb=>cb('SUBSCRIBED')));
  expect(reads).not.toContain('own-later');
  await act(async()=>resolve(json(missed.slice(0,50))));
  await screen.findByText('Gap 60');
  expect(screen.getByText('Gap 1')).toBeTruthy();
  expect(screen.getAllByText(own.content)).toHaveLength(1);
});
it('does not let an older reaction response undo a second toggle',async()=>{
  let resolveFirst!:(response:Response)=>void;
  const first=new Promise<Response>(r=>{resolveFirst=r;});
  let requests=0;
  vi.stubGlobal('fetch',vi.fn((url:string)=>url.endsWith('/reactions')?(++requests===1?first:Promise.resolve(json({action:'removed'}))):Promise.resolve(json(url.endsWith('/read')?{}:[message]))));
  render(<MessageThread {...props}/>);
  await screen.findByText('Reaction fixture');
  fireEvent.click(screen.getByRole('button',{name:/👍\s*1/}));
  await act(async()=>events.find(e=>e.table==='message_reactions'&&e.event==='INSERT')!.callback({new:{message_id:'m',user_id:'u',emoji:'👍'}}));
  fireEvent.click(screen.getByRole('button',{name:/👍\s*2/}));
  await act(async()=>resolveFirst(json({action:'added'})));
  await waitFor(()=>expect(screen.getByRole('button',{name:/👍\s*1/})).toBeTruthy());
});
