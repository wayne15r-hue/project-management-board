// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CardDetailDialog } from "../../src/components/board/card-detail-dialog";
import type { Card } from "../../src/types";

vi.mock("@tanstack/react-query",()=>({useQueryClient:()=>({invalidateQueries:vi.fn()})}));
vi.mock("@/components/ui/dialog", () => ({ Dialog: ({children}: {children: React.ReactNode}) => <div>{children}</div>, DialogContent: ({children}: {children: React.ReactNode}) => <div>{children}</div>, DialogHeader: ({children}: {children: React.ReactNode}) => <div>{children}</div>, DialogTitle: ({children}: {children: React.ReactNode}) => <div>{children}</div> }));
vi.mock("@/components/ui/popover", () => ({Popover: ({children}: {children: React.ReactNode}) => <div>{children}</div>, PopoverContent: () => null, PopoverTrigger: ({children}: {children: React.ReactNode}) => <div>{children}</div>}));
vi.mock("@/components/board/subtasks", () => ({Subtasks: () => null}));
vi.mock("@/components/board/approval-panel", () => ({ApprovalPanel: () => <div>Approval panel<select aria-label="Approval reviewer"><option>A</option><option>B</option></select></div>}));
vi.mock("@/components/board/attachments", () => ({Attachments: () => null}));
vi.mock("@/components/board/label-picker", () => ({LabelPicker: () => null}));
vi.mock("@/components/activity/activity-feed", () => ({ActivityFeed: () => null}));
vi.mock("@/components/ai/ai-suggestions", () => ({AISuggestions: () => null}));
vi.mock("@/components/ai/ai-writing-assistant", () => ({AIWritingAssistant: () => null}));
const card = {id:"one",title:"Original",description:null,priority:"medium",column_id:"a",created_at:"2026-01-01"} as Card;
afterEach(cleanup);
describe("card editor write failure", () => {
  it("explains approval conflicts while retaining the edited draft",async()=>{
    const update=vi.fn().mockRejectedValue(new Error("Approval required before completion. Request review first."));
    render(<CardDetailDialog card={card} columns={[]} members={[]} open onOpenChange={vi.fn()} onUpdate={update} onDelete={vi.fn()}/>);
    const title=screen.getByPlaceholderText("Untitled");fireEvent.change(title,{target:{value:"Keep approval draft"}});fireEvent.blur(title);
    await screen.findByText("Approval required before completion. Request review first.");
    expect((title as HTMLInputElement).value).toBe("Keep approval draft");
  });
  it("leaves native reviewer select arrow keys to the select without navigating cards", () => {
    const navigate=vi.fn();render(<CardDetailDialog card={card} columns={[]} members={[]} open onOpenChange={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} onNavigate={navigate}/>);
    fireEvent.change(screen.getByPlaceholderText("Untitled"),{target:{value:"Unsaved title"}});
    fireEvent.keyDown(screen.getByLabelText("Approval reviewer"),{key:"ArrowDown"});fireEvent.keyDown(screen.getByLabelText("Approval reviewer"),{key:"ArrowUp"});
    expect(navigate).not.toHaveBeenCalled();expect((screen.getByPlaceholderText("Untitled") as HTMLInputElement).value).toBe("Unsaved title");
  });
  it("retains unsaved title and description when a successful approval refresh supplies the same card", () => {
    const props={columns:[],members:[],open:true,onOpenChange:vi.fn(),onUpdate:vi.fn(),onDelete:vi.fn()};
    const view=render(<CardDetailDialog {...props} card={card}/>);
    fireEvent.change(screen.getByPlaceholderText("Untitled"),{target:{value:"Unsaved title"}});
    fireEvent.change(screen.getByPlaceholderText("Add a description..."),{target:{value:"Unsaved description"}});
    view.rerender(<CardDetailDialog {...props} card={{...card,title:"Server title"}}/>);
    expect((screen.getByPlaceholderText("Untitled") as HTMLInputElement).value).toBe("Unsaved title");
    expect((screen.getByPlaceholderText("Add a description...") as HTMLTextAreaElement).value).toBe("Unsaved description");
  });
  it("never dispatches queued saves after the editor unmounts on account switch", async () => {
    let finish!:()=>void;
    const update=vi.fn().mockImplementationOnce(()=>new Promise<void>(resolve=>{finish=resolve;})).mockResolvedValue(undefined);
    const view=render(<CardDetailDialog card={card} columns={[]} members={[]} open onOpenChange={vi.fn()} onUpdate={update} onDelete={vi.fn()} />);
    const title=screen.getByPlaceholderText("Untitled");
    fireEvent.change(title,{target:{value:"First update"}});fireEvent.blur(title);
    await waitFor(()=>expect(update).toHaveBeenCalledTimes(1));
    fireEvent.change(title,{target:{value:"Queued update"}});fireEvent.blur(title);
    view.unmount();await act(async()=>finish());
    expect(update).toHaveBeenCalledTimes(1);
  });
  it("requires a reason to block, retains it after failure and retries the same update", async () => {
    const update=vi.fn().mockRejectedValueOnce(new Error("500")).mockResolvedValue(undefined);
    render(<CardDetailDialog card={card} columns={[]} members={[]} open onOpenChange={vi.fn()} onUpdate={update} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByRole("button",{name:"Mark blocked"}));
    expect(update).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Blocked reason"),{target:{value:"  Waiting for supplier  "}});
    fireEvent.click(screen.getByRole("button",{name:"Save blocked status"}));
    await screen.findByText("Save failed");
    expect((screen.getByLabelText("Blocked reason") as HTMLTextAreaElement).value).toBe("Waiting for supplier");
    fireEvent.click(screen.getByText("Retry"));
    await screen.findByText("Saved");
    expect(update).toHaveBeenLastCalledWith("one",{is_blocked:true,blocked_reason:"Waiting for supplier"});
  });
  it("clears the blocked reason when unblocking", async () => {
    const update=vi.fn().mockResolvedValue(undefined);
    render(<CardDetailDialog card={{...card,is_blocked:true,blocked_reason:"Supplier"}} columns={[]} members={[]} open onOpenChange={vi.fn()} onUpdate={update} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByRole("button",{name:"Unblock task"}));
    await waitFor(()=>expect(update).toHaveBeenCalledWith("one",{is_blocked:false,blocked_reason:null}));
  });
  it("retains edited input and shows failure/retry, never Saved, on a rejected update", async () => {
    const update=vi.fn().mockRejectedValueOnce(new Error("403")).mockResolvedValue(undefined);
    render(<CardDetailDialog card={card} columns={[]} members={[]} open onOpenChange={vi.fn()} onUpdate={update} onDelete={vi.fn()} />);
    const title=screen.getByPlaceholderText("Untitled");
    fireEvent.change(title,{target:{value:"Keep this draft"}}); fireEvent.blur(title);
    await screen.findByText("Save failed");
    expect(screen.queryByText("Saved")).toBeNull(); expect((title as HTMLInputElement).value).toBe("Keep this draft");
    fireEvent.click(screen.getByText("Retry"));
    await screen.findByText("Saved");
    expect(update).toHaveBeenLastCalledWith("one",{title:"Keep this draft"});
  });
  it("keeps a card dialog open when delete fails", async () => {
    const close=vi.fn(); const remove=vi.fn().mockRejectedValue(new Error("500"));
    render(<CardDetailDialog card={card} columns={[]} members={[]} open onOpenChange={close} onUpdate={vi.fn()} onDelete={remove} />);
    fireEvent.click(screen.getByText("Delete card")); fireEvent.click(screen.getByText("Click again to confirm"));
    await waitFor(()=>expect(remove).toHaveBeenCalledOnce());
    await screen.findByText("Delete failed. Try again."); expect(close).not.toHaveBeenCalled();
  });
});
