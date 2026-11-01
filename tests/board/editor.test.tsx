// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CardDetailDialog } from "../../src/components/board/card-detail-dialog";
import type { Card } from "../../src/types";

vi.mock("@/components/ui/dialog", () => ({ Dialog: ({children}: {children: React.ReactNode}) => <div>{children}</div>, DialogContent: ({children}: {children: React.ReactNode}) => <div>{children}</div>, DialogHeader: ({children}: {children: React.ReactNode}) => <div>{children}</div>, DialogTitle: ({children}: {children: React.ReactNode}) => <div>{children}</div> }));
vi.mock("@/components/ui/popover", () => ({Popover: ({children}: {children: React.ReactNode}) => <div>{children}</div>, PopoverContent: () => null, PopoverTrigger: ({children}: {children: React.ReactNode}) => <div>{children}</div>}));
vi.mock("@/components/board/subtasks", () => ({Subtasks: () => null}));
vi.mock("@/components/board/attachments", () => ({Attachments: () => null}));
vi.mock("@/components/board/label-picker", () => ({LabelPicker: () => null}));
vi.mock("@/components/activity/activity-feed", () => ({ActivityFeed: () => null}));
vi.mock("@/components/ai/ai-suggestions", () => ({AISuggestions: () => null}));
vi.mock("@/components/ai/ai-writing-assistant", () => ({AIWritingAssistant: () => null}));
const card = {id:"one",title:"Original",description:null,priority:"medium",column_id:"a",created_at:"2026-01-01"} as Card;
afterEach(cleanup);
describe("card editor write failure", () => {
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
