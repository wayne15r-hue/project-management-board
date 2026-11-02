// @vitest-environment jsdom
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {act,cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {MyWork} from "@/components/my-work/my-work";
const auth=vi.hoisted(()=>({listener:null as null|((event:string,session:{user:{id:string}}|null)=>void)}));
vi.mock("@/lib/supabase/client",()=>({createClient:()=>({auth:{onAuthStateChange:(cb:typeof auth.listener)=>{auth.listener=cb;return {data:{subscription:{unsubscribe:vi.fn()}}};}}})}));
vi.mock("@/components/board/card-detail-dialog",()=>({CardDetailDialog:({card,board,onUpdate}:{card:{id:string;title:string};board:{name:string};onUpdate:(id:string,data:unknown)=>Promise<void>})=><div role="dialog" aria-label="Task editor"><p>{board.name} editor</p><p>{card.title}</p><button onClick={()=>void onUpdate(card.id,{title:"Updated supplier"})}>Save task</button></div>}));
const item={id:"one",title:"Call supplier",board_id:"board",column_id:"column",priority:"high",due_date:"2026-11-01T12:00:00Z",is_blocked:true,blocked_reason:"Waiting",board:{id:"board",name:"Operations",owner_id:"user"},column:{id:"column",name:"To Do"},group:"overdue",is_overdue:true,is_due_today:false};
const result={items:[item],counts:{overdue:1,dueToday:0,blocked:1,totalOpen:51},total:51,page:1,pageSize:50,boards:[{id:"board",name:"Operations"}]};
let client:QueryClient;
function mount(){client=new QueryClient({defaultOptions:{queries:{retry:false}}});return render(<QueryClientProvider client={client}><MyWork userId="user" /></QueryClientProvider>);}
beforeEach(()=>vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>result})));
afterEach(()=>{cleanup();client?.clear();vi.unstubAllGlobals();});
describe("My Work",()=>{
  it("shows task context, groups and full counts and requests the next page",async()=>{
    mount();await screen.findByRole("button",{name:"Call supplier"});
    expect(screen.getAllByText("Operations").length).toBeGreaterThan(0);
    expect(screen.getByText("51")).toBeTruthy();
    expect(screen.getByText("Waiting")).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"Next page"}));
    await waitFor(()=>expect(vi.mocked(fetch).mock.calls.some(([url])=>String(url).includes("page=2"))).toBe(true));
  });
  it("switches attention, board and title filters with page reset",async()=>{
    mount();await screen.findByText("Call supplier");
    fireEvent.click(screen.getByRole("tab",{name:"Needs Attention"}));
    fireEvent.change(screen.getByLabelText("Filter by board"),{target:{value:"board"}});
    fireEvent.change(screen.getByLabelText("Search tasks"),{target:{value:"supplier"}});
    await waitFor(()=>expect(vi.mocked(fetch).mock.calls.some(([url])=>String(url).includes("tab=attention")&&String(url).includes("board=board")&&String(url).includes("search=supplier")&&String(url).includes("page=1"))).toBe(true));
  });
  it("shows a retryable error rather than an empty list",async()=>{
    vi.mocked(fetch).mockRejectedValueOnce(new Error("offline"));mount();
    await screen.findByRole("alert");fireEvent.click(screen.getByRole("button",{name:"Retry"}));
    await screen.findByText("Call supplier");
  });
  it("groups today, future and undated assignments and shows an honest empty state",async()=>{
    vi.mocked(fetch).mockResolvedValueOnce({ok:true,json:async()=>({...result,items:[item,{...item,id:"two",title:"Today task",group:"today"},{...item,id:"three",title:"Future task",group:"upcoming"},{...item,id:"four",title:"Undated task",group:"undated"}],total:4})} as Response);
    mount();await screen.findByText("Today task");
    for(const name of ["Overdue","Today","Upcoming","No Due Date"])expect(screen.getByRole("heading",{name:new RegExp(`^${name}$`)})).toBeTruthy();
    vi.mocked(fetch).mockResolvedValueOnce({ok:true,json:async()=>({...result,items:[],total:0,counts:{overdue:0,dueToday:0,blocked:0,totalOpen:0}})} as Response);
    fireEvent.change(screen.getByLabelText("Search tasks"),{target:{value:"no match"}});
    await screen.findByText("No matching tasks");
  });
  it("loads the existing editor with board context and refreshes after saving",async()=>{
    vi.mocked(fetch).mockImplementation(async(url,options)=>{
      const path=String(url);
      if(path==="/api/cards/one"&&options?.method==="PATCH")return {ok:true,json:async()=>({...item,title:"Updated supplier"})} as Response;
      if(path==="/api/cards/one")return {ok:true,json:async()=>item} as Response;
      if(path==="/api/boards/board")return {ok:true,json:async()=>({id:"board",name:"Operations",columns:[]})} as Response;
      if(path==="/api/members")return {ok:true,json:async()=>[]} as Response;
      return {ok:true,json:async()=>result} as Response;
    });
    mount();fireEvent.click(await screen.findByRole("button",{name:"Call supplier"}));
    await screen.findByText("Operations editor");fireEvent.click(screen.getByRole("button",{name:"Save task"}));
    await screen.findByText("Updated supplier");
    await waitFor(()=>expect(vi.mocked(fetch).mock.calls.filter(([url])=>String(url).startsWith("/api/my-work")).length).toBeGreaterThan(1));
  });
  it("refreshes when the tab becomes visible",async()=>{
    mount();await screen.findByText("Call supplier");const before=vi.mocked(fetch).mock.calls.length;
    Object.defineProperty(document,"visibilityState",{configurable:true,value:"visible"});
    fireEvent(document,new Event("visibilitychange"));
    await waitFor(()=>expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThan(before));
  });
  it("supports arrow-key navigation between the work tabs",async()=>{
    mount();await screen.findByText("Call supplier");
    fireEvent.keyDown(screen.getByRole("tab",{name:"My Work"}),{key:"ArrowRight"});
    await waitFor(()=>expect(screen.getByRole("tab",{name:"Needs Attention"}).getAttribute("aria-selected")).toBe("true"));
    expect(document.activeElement).toBe(screen.getByRole("tab",{name:"Needs Attention"}));
  });
  it("removes private results and caches immediately when the account changes",async()=>{
    mount();await screen.findByText("Call supplier");
    await act(async()=>auth.listener!("SIGNED_IN",{user:{id:"other"}}));
    expect(screen.queryByText("Call supplier")).toBeNull();
    expect(client.getQueriesData({queryKey:["my-work","user"]}).every(([,data])=>data===undefined)).toBe(true);
  });
});
