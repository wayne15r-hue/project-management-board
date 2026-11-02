// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NewConversationDialog } from '@/components/chat/new-conversation-dialog';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const other={id:'00000000-0000-4000-8000-000000000002',full_name:'QA Other',email:'qa@example.test',avatar_url:null};
it('explicitly creates a named group with one other person',async()=>{
  const fetcher=vi.fn(async(url:string,..._request: [RequestInit?])=>{ void _request; return new Response(JSON.stringify(url.includes('/search')?[other]:{id:'created'})); });
  vi.stubGlobal('fetch',fetcher);
  const created=vi.fn();
  render(<NewConversationDialog open onOpenChange={()=>{}} onCreated={created}/>);
  fireEvent.click(screen.getByRole('checkbox',{name:'Create group'}));
  fireEvent.click(await screen.findByRole('button',{name:/QA Other.*qa@example.test/}));
  const name=screen.getByLabelText('Group name (required)');
  expect(name.getAttribute('maxlength')).toBe('100');
  fireEvent.change(name,{target:{value:'QA pair'}});
  fireEvent.click(screen.getByRole('button',{name:'Start'}));
  await waitFor(()=>expect(created).toHaveBeenCalledWith('created'));
  const init=fetcher.mock.calls.find(([url])=>url==='/api/conversations')![1] as RequestInit;
  expect(JSON.parse(String(init.body))).toEqual({type:'group',name:'QA pair',userIds:[other.id]});
});
it('retains details and edited name after failed rename and exposes roles',async()=>{
  const {GroupDetailsDialog}=await import('@/components/chat/group-details-dialog');
  vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>new Response(JSON.stringify(url.includes('/search')?[]:init?.method==='PATCH'?{error:'The last admin must promote another member first'}:{name:'Original',members:[{...other,is_admin:true}]}),{status:init?.method==='PATCH'?409:200})));
  const changed=vi.fn();
  render(<GroupDetailsDialog open conversationId="qa" currentUserId={other.id} onOpenChange={()=>{}} onChanged={changed} onAccessRevoked={()=>{}}/>);
  const input=await screen.findByLabelText('Group name');
  expect(screen.getByText('Admin')).toBeTruthy();
  fireEvent.change(input,{target:{value:'Keep this rename'}});
  fireEvent.click(screen.getByRole('button',{name:'Save name'}));
  await screen.findByRole('alert');
  expect((screen.getByLabelText('Group name') as HTMLInputElement).value).toBe('Keep this rename');
  expect(screen.getByRole('dialog')).toBeTruthy();
  expect(changed).not.toHaveBeenCalled();
});
it('ordinary members can leave but cannot see admin controls, and a failed leave retains details',async()=>{
  const {GroupDetailsDialog}=await import('@/components/chat/group-details-dialog');
  vi.stubGlobal('fetch',vi.fn(async(_url:string,init?:RequestInit)=>new Response(JSON.stringify(init?.method==='PATCH'?{error:'Connection interrupted'}:{name:'QA members',members:[{...other,is_admin:false}]}),{status:init?.method==='PATCH'?500:200})));
  const revoked=vi.fn();
  render(<GroupDetailsDialog open conversationId="qa" currentUserId={other.id} onOpenChange={()=>{}} onChanged={()=>{}} onAccessRevoked={revoked}/>);
  await screen.findByText('Member');
  expect(screen.queryByRole('button',{name:'Save name'})).toBeNull();
  expect(screen.queryByLabelText('Add member')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Leave group'}));
  await screen.findByText('Connection interrupted');
  expect(screen.getByRole('dialog')).toBeTruthy();
  expect(revoked).not.toHaveBeenCalled();
});
it('successful leave invalidates access without invoking conversation deletion',async()=>{
  const {GroupDetailsDialog}=await import('@/components/chat/group-details-dialog');
  const mutations:unknown[]=[];
  vi.stubGlobal('fetch',vi.fn(async(_url:string,init?:RequestInit)=>{
    if(init?.method==='PATCH') { mutations.push(JSON.parse(String(init.body))); return new Response(JSON.stringify({ok:true})); }
    return new Response(JSON.stringify({name:'QA members',members:[{...other,is_admin:false}]}));
  }));
  const revoked=vi.fn();
  render(<GroupDetailsDialog open conversationId="qa" currentUserId={other.id} onOpenChange={()=>{}} onChanged={()=>{}} onAccessRevoked={revoked}/>);
  fireEvent.click(await screen.findByRole('button',{name:'Leave group'}));
  await waitFor(()=>expect(revoked).toHaveBeenCalledOnce());
  expect(mutations).toEqual([{action:'leave'}]);
});
