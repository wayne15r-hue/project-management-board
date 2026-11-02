// @vitest-environment jsdom
import {afterEach,expect,it,vi} from "vitest";
import {act,cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {ApprovalPanel} from "@/components/board/approval-panel";
const auth=vi.hoisted(()=>({listener:null as null|((event:string,session:{user:{id:string}}|null)=>void)}));
vi.mock("@/lib/supabase/client",()=>({createClient:()=>({auth:{onAuthStateChange:(cb:typeof auth.listener)=>{auth.listener=cb;return {data:{subscription:{unsubscribe:vi.fn()}}};}}})}));
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it("requires an explicit request and retains operation identity on uncertain retry",async()=>{
 const details={required:true,reviewer_id:"r",revision:2,status:"not_requested",can_configure:false,can_request:true,can_decide:false,current_request:null,history:[],eligible_reviewers:[],timezone:"UTC",current_user_id:"u"};
 const posts:string[]=[];
 vi.stubGlobal("fetch",vi.fn(async(_url,init)=>{if(init?.method==="POST"){posts.push(init.body);if(posts.length===1)throw Error("offline");}return {ok:true,json:async()=>details};}));
 render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><ApprovalPanel cardId="c" boardId="b"/></QueryClientProvider>);
 await screen.findByText("Not requested");expect(posts).toHaveLength(0);
 fireEvent.click(screen.getByRole("button",{name:"Request review"}));
 await screen.findByRole("alert");fireEvent.click(screen.getByRole("button",{name:"Retry action"}));
 await waitFor(()=>expect(posts).toHaveLength(2));expect(JSON.parse(posts[0]).operationId).toBe(JSON.parse(posts[1]).operationId);
});
it("requires a reason for request changes and displays the frozen request deadline",async()=>{
 const details={required:true,reviewer_id:"r",revision:3,status:"pending",can_configure:false,can_request:false,can_decide:true,current_request:{id:"request",reviewer_name:"Review Member",review_due_date:"2026-11-03",review_timezone:"Asia/Kolkata"},history:[],eligible_reviewers:[],timezone:"UTC",current_user_id:"r"};
 vi.stubGlobal("fetch",vi.fn(async()=>({ok:true,json:async()=>details})));
 render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><ApprovalPanel cardId="c" boardId="b"/></QueryClientProvider>);
 await screen.findByText(/2026-11-03.*Asia\/Kolkata/);
 const changes=screen.getByRole("button",{name:"Request changes"});expect((changes as HTMLButtonElement).disabled).toBe(true);
 fireEvent.change(screen.getByLabelText("Approval note"),{target:{value:"Please attach evidence"}});fireEvent.click(changes);
 await waitFor(()=>expect(vi.mocked(fetch).mock.calls.some(([,init])=>init?.body&&JSON.parse(init.body as string).note==="Please attach evidence")).toBe(true));
});
it("requires the owner to give a reason before disabling approval",async()=>{
 const details={required:true,reviewer_id:"r",revision:8,status:"not_requested",can_configure:true,can_request:true,can_decide:false,current_request:null,history:[],eligible_reviewers:[{id:"r",full_name:"Independent reviewer",avatar_url:null}],timezone:"UTC",current_user_id:"u"};
 vi.stubGlobal("fetch",vi.fn(async()=>({ok:true,json:async()=>details})));
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});const invalidate=vi.spyOn(client,"invalidateQueries");
 render(<QueryClientProvider client={client}><ApprovalPanel cardId="c" boardId="b"/></QueryClientProvider>);
 const disable=await screen.findByRole("button",{name:"Disable approval"});expect((disable as HTMLButtonElement).disabled).toBe(true);
 fireEvent.change(screen.getByLabelText("Approval note"),{target:{value:"Review no longer needed"}});fireEvent.click(disable);
 await waitFor(()=>expect(vi.mocked(fetch).mock.calls.some(([,init])=>init?.body&&JSON.parse(init.body as string).reason==="Review no longer needed")).toBe(true));
 await waitFor(()=>expect(invalidate).toHaveBeenCalled());
 const filter=invalidate.mock.calls.find(([arg])=>arg?.predicate)?.[0]?.predicate;
 expect(filter?.({queryKey:["my-work","u","list"]} as never)).toBe(true);
 expect(filter?.({queryKey:["my-work","u","editor","c"]} as never)).toBe(false);
});
it("refreshes a known stale revision without resubmitting and preserves the note for an explicit new action",async()=>{
 const details={required:true,reviewer_id:"r",revision:2,status:"not_requested",can_configure:false,can_request:true,can_decide:false,current_request:null,history:[],eligible_reviewers:[],timezone:"UTC",current_user_id:"u"};let reads=0;const posts:string[]=[];
 vi.stubGlobal("fetch",vi.fn(async(_url,init)=>{if(init?.method==="POST"){posts.push(init.body);return posts.length===1?{ok:false,status:409,json:async()=>({error:"Task changed"})}:{ok:true,json:async()=>({...details,revision:3})};}reads++;return {ok:true,json:async()=>({...details,revision:reads===1?2:3})};}));
 render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><ApprovalPanel cardId="c" boardId="b"/></QueryClientProvider>);
 await screen.findByText("Not requested");fireEvent.change(screen.getByLabelText("Approval note"),{target:{value:"Keep this note"}});fireEvent.click(screen.getByRole("button",{name:"Request review"}));await screen.findByRole("alert");
 await waitFor(()=>expect(reads).toBe(2));expect(posts).toHaveLength(1);expect(screen.queryByRole("button",{name:"Retry action"})).toBeNull();expect((screen.getByLabelText("Approval note") as HTMLTextAreaElement).value).toBe("Keep this note");
 fireEvent.click(screen.getByRole("button",{name:"Request review"}));await waitFor(()=>expect(posts).toHaveLength(2));expect(JSON.parse(posts[1]).expectedRevision).toBe(3);expect(JSON.parse(posts[1]).operationId).not.toBe(JSON.parse(posts[0]).operationId);
});
it("clears private approval results and cache immediately on account replacement",async()=>{
 const details={required:true,reviewer_id:"r",revision:2,status:"not_requested",can_configure:false,can_request:true,can_decide:false,current_request:null,history:[{id:"h",action:"configured",actor_name:"Private member",created_at:new Date().toISOString(),note:null}],eligible_reviewers:[],timezone:"UTC",current_user_id:"u"};
 vi.stubGlobal("fetch",vi.fn(async()=>({ok:true,json:async()=>details})));
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});render(<QueryClientProvider client={client}><ApprovalPanel cardId="c" boardId="b"/></QueryClientProvider>);
 await screen.findByText(/Private member/);await act(async()=>auth.listener!("SIGNED_IN",{user:{id:"different"}}));
 expect(screen.queryByText(/Private member/)).toBeNull();expect(screen.getByRole("status").textContent).toContain("Updating your session");expect(client.getQueryData(["approval","c"])).toBeUndefined();
});
