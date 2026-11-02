// @vitest-environment jsdom
import {afterEach,expect,it,vi} from "vitest";
import {act,cleanup,fireEvent,render,screen} from "@testing-library/react";
import {BoardHeader} from "@/components/board/board-header";
const auth=vi.hoisted(()=>({listener:null as null|((event:string,session:{user:{id:string}}|null)=>void)}));
vi.mock("@/lib/supabase/client",()=>({createClient:()=>({auth:{getUser:async()=>({data:{user:{id:"owner"}}}),onAuthStateChange:(cb:typeof auth.listener)=>{auth.listener=cb;return {data:{subscription:{unsubscribe:vi.fn()}}};}}})}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:vi.fn(),push:vi.fn()})}));
vi.mock("@tanstack/react-query",()=>({useQueryClient:()=>({})}));
vi.mock("@/components/board/workflow-settings-dialog",()=>({WorkflowSettingsDialog:()=> <div role="dialog">Workflow settings draft</div>}));
vi.mock("@/components/board/view-controls",()=>({ViewControls:()=>null}));
vi.mock("@/components/board/import-cards-dialog",()=>({ImportCardsDialog:()=>null}));
vi.mock("@/components/ai/board-summary-dialog",()=>({BoardSummaryDialog:()=>null}));
vi.mock("@/components/ai/import-notes-dialog",()=>({ImportNotesDialog:()=>null}));
afterEach(cleanup);
it("keeps workflow drafts open on same-account refresh and closes on identity replacement",async()=>{
 render(<BoardHeader board={{id:"b",name:"Board",owner_id:"owner",columns:[]} as never} members={[]} activeView="kanban" onViewChange={vi.fn()}/>);
 fireEvent.click(await screen.findByRole("button",{name:"Workflow"}));await screen.findByRole("dialog");
 await act(async()=>auth.listener!("TOKEN_REFRESHED",{user:{id:"owner"}}));expect(screen.getByRole("dialog")).toBeTruthy();
 await act(async()=>auth.listener!("SIGNED_IN",{user:{id:"owner"}}));expect(screen.getByRole("dialog")).toBeTruthy();
 await act(async()=>auth.listener!("SIGNED_IN",{user:{id:"other"}}));expect(screen.queryByRole("dialog")).toBeNull();
});
