// @vitest-environment jsdom
import {afterEach,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {WorkflowSettingsDialog} from "@/components/board/workflow-settings-dialog";
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it("starts disabled, displays honest health and posts only safe failure retries",async()=>{
 vi.stubGlobal("fetch",vi.fn(async()=>({ok:true,json:async()=>({settings:{scheduling_enabled:false,timezone:"UTC"},health:{pending:2,failed:1,disabled:4,needsReview:3,accepted:5}})})));
 render(<WorkflowSettingsDialog boardId="b" open onOpenChange={vi.fn()}/>);
 const toggle=await screen.findByRole("checkbox");expect((toggle as HTMLInputElement).checked).toBe(false);
 expect(screen.getByText("Needs inspection")).toBeTruthy();expect(screen.getByText(/does not confirm inbox delivery/)).toBeTruthy();
 fireEvent.click(screen.getByRole("button",{name:"Retry eligible failures"}));
 await waitFor(()=>expect(vi.mocked(fetch).mock.calls.some(([,init])=>init?.body===JSON.stringify({action:"retry_failed"}))).toBe(true));
});
it("retains unsaved scheduling and timezone drafts when refreshing health or retrying failures",async()=>{
 vi.stubGlobal("fetch",vi.fn(async()=>({ok:true,json:async()=>({settings:{scheduling_enabled:false,timezone:"UTC"},health:{pending:2,failed:1,disabled:4,needsReview:3,accepted:5}})})));
 render(<WorkflowSettingsDialog boardId="b" open onOpenChange={vi.fn()}/>);
 const toggle=await screen.findByRole("checkbox");fireEvent.click(toggle);fireEvent.change(screen.getByLabelText("Board timezone"),{target:{value:"Asia/Kolkata"}});
 fireEvent.click(screen.getByRole("button",{name:"Refresh health"}));await waitFor(()=>expect((screen.getByRole("button",{name:"Refresh health"}) as HTMLButtonElement).disabled).toBe(false));
 expect((toggle as HTMLInputElement).checked).toBe(true);expect((screen.getByLabelText("Board timezone") as HTMLInputElement).value).toBe("Asia/Kolkata");
 fireEvent.click(screen.getByRole("button",{name:"Retry eligible failures"}));await waitFor(()=>expect(vi.mocked(fetch).mock.calls).toHaveLength(3));
 expect((toggle as HTMLInputElement).checked).toBe(true);expect((screen.getByLabelText("Board timezone") as HTMLInputElement).value).toBe("Asia/Kolkata");
});
