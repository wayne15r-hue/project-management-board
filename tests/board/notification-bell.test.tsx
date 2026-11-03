// @vitest-environment jsdom
import {afterEach,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {NotificationBell} from "@/components/notifications/notification-bell";
const mocks=vi.hoisted(()=>({callbacks:[] as (()=>void)[],push:vi.fn(),auth:null as null|((event:string,session:{user:{id:string}}|null)=>void)}));
vi.mock("next/navigation",()=>({useRouter:()=>({push:mocks.push})}));
vi.mock("@/lib/supabase/client",()=>({createClient:()=>({channel:()=>{const c={on:(_e:unknown,_f:unknown,cb:()=>void)=>{mocks.callbacks.push(cb);return c;},subscribe:()=>c};return c;},removeChannel:vi.fn(),auth:{onAuthStateChange:(cb:typeof mocks.auth)=>{mocks.auth=cb;return {data:{subscription:{unsubscribe:vi.fn()}}};}}})}));
afterEach(()=>{cleanup();mocks.callbacks=[];vi.unstubAllGlobals();});
it("keeps unread state and offers retry after a failed read",async()=>{
 vi.stubGlobal("fetch",vi.fn(async(_url,init)=>({ok:!init?.method,json:async()=>({notifications:[{id:"n",title:"Review task",type:"review_requested",read_at:null,created_at:new Date().toISOString(),actor:null}],unread_count:1})})));
 render(<NotificationBell userId="u"/>);fireEvent.click(screen.getByRole("button",{name:"Notifications"}));
 fireEvent.click(await screen.findByRole("button",{name:/Mark all read/}));
 await screen.findByRole("alert");expect(screen.getByRole("button",{name:/Mark all read/})).toBeTruthy();
});
it("refetches duplicate realtime events without incrementing counts",async()=>{
 vi.stubGlobal("fetch",vi.fn(async()=>({ok:true,json:async()=>({notifications:[],unread_count:2})})));
 render(<NotificationBell userId="u"/>);await screen.findByText("2");mocks.callbacks[0]();mocks.callbacks[0]();
 await waitFor(()=>expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThan(1));expect(screen.queryByText("4")).toBeNull();
});
it("rejects an old account response and stale realtime callback after account replacement",async()=>{
 let finish!:(data:unknown)=>void;
 vi.stubGlobal("fetch",vi.fn().mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;})).mockResolvedValue({ok:true,json:async()=>({notifications:[],unread_count:0})}));
 const view=render(<NotificationBell userId="old"/>);const previous=mocks.callbacks[0];
 view.rerender(<NotificationBell userId="new"/>);
 finish({ok:true,json:async()=>({notifications:[],unread_count:91})});previous();
 await waitFor(()=>expect(vi.mocked(fetch).mock.calls.length).toBe(2));expect(screen.queryByText("91")).toBeNull();
});
it('opens ticket notifications in Service Desk',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({notifications:[{id:'desk:ticket-alert',ticket_id:'ticket-123',title:'SD-000001 · VPN issue',type:'assign',read_at:'2026-11-02',created_at:new Date().toISOString(),actor:null}],unread_count:0})})));
 render(<NotificationBell userId="u"/>);fireEvent.click(screen.getByRole('button',{name:'Notifications'}));
 fireEvent.click(await screen.findByRole('button',{name:/SD-000001/}));
 expect(mocks.push).toHaveBeenCalledWith('/dashboard/service-desk/ticket-123');
});
it('opens a leave notification in its private request detail',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({notifications:[{id:'leave:alert',request_id:'request-123',title:'Leave request updated',type:'leave_update',read_at:'2026-11-03',created_at:new Date().toISOString(),actor:null}],unread_count:0})})));
 render(<NotificationBell userId="u"/>);fireEvent.click(screen.getByRole('button',{name:'Notifications'}));
 fireEvent.click(await screen.findByRole('button',{name:/Leave request updated/}));
 expect(mocks.push).toHaveBeenCalledWith('/dashboard/leave-desk/request-123');
});
