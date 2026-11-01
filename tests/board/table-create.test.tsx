// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TableView } from "@/components/table-view/data-table";
import { useBoardStore } from "@/stores/board-store";
import type { BoardWithDetails, Card } from "@/types";

vi.mock("@/components/board/card-detail-dialog", () => ({ CardDetailDialog: () => null }));
const base = () => ({ id: "qa-board", name: "QA Board", columns: [
  { id: "todo", name: "To Do", color: null, cards: [] },
  { id: "review", name: "Review", color: null, cards: [] },
] }) as unknown as BoardWithDetails;
beforeEach(() => useBoardStore.setState({ search: "", filters: [], sorts: [] }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it.each([false, true])("creates a task in the selected column with existing tasks=%s", async existing => {
  const board = base();
  if (existing) board.columns[0].cards.push({ id: "old", title: "Existing task", priority: "medium", created_at: "2026-11-01", due_date: null } as Card);
  let payload: unknown;
  vi.stubGlobal("fetch", vi.fn(async (_url, options) => {
    payload = JSON.parse(options.body);
    return new Response(JSON.stringify({ id: "created", title: "Created from Table", column_id: "review", priority: "medium", created_at: "2026-11-01", due_date: null }), { status: 201 });
  }));
  const refresh = () => {
    board.columns[1].cards.push({ id: "created", title: "Created from Table", priority: "medium", created_at: "2026-11-01", due_date: null } as Card);
    view.rerender(<TableView board={{ ...board, columns: [...board.columns] }} members={[]} onRefresh={refresh} />);
  };
  const view = render(<TableView board={board} members={[]} onRefresh={refresh} />);
  fireEvent.click(screen.getByRole("button", { name: "New" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Task title" }), { target: { value: "  Created from Table  " } });
  fireEvent.change(screen.getByRole("combobox", { name: "Column" }), { target: { value: "review" } });
  fireEvent.click(screen.getByRole("button", { name: "Create task" }));
  await screen.findByText("Created from Table");
  expect(payload).toEqual({ columnId: "review", title: "Created from Table" });
  expect(screen.queryByRole("textbox", { name: "Task title" })).toBeNull();
});

it("retains task input and column selection after a rejected creation", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"error":"unavailable"}', { status: 500 })));
  render(<TableView board={base()} members={[]} onRefresh={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "New" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Task title" }), { target: { value: "Keep this draft" } });
  fireEvent.change(screen.getByRole("combobox", { name: "Column" }), { target: { value: "review" } });
  fireEvent.click(screen.getByRole("button", { name: "Create task" }));
  await screen.findByRole("button", { name: "Create task" });
  expect((screen.getByRole("textbox", { name: "Task title" }) as HTMLInputElement).value).toBe("Keep this draft");
  expect((screen.getByRole("combobox", { name: "Column" }) as HTMLSelectElement).value).toBe("review");
});
