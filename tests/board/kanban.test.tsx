// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { KanbanBoard } from "../../src/components/board/kanban-board";
import { useBoardStore } from "../../src/stores/board-store";
import type { BoardWithDetails } from "../../src/types";
const dnd = vi.hoisted(() => ({ props: {} as Record<string, (event?: unknown) => unknown> }));
vi.mock("@dnd-kit/core", () => ({DndContext: (props: typeof dnd.props & {children: React.ReactNode}) => {dnd.props=props;return <div>{props.children}</div>},closestCorners:vi.fn(),DragOverlay:()=>null,useSensor:vi.fn(),useSensors:vi.fn(),PointerSensor:vi.fn(),KeyboardSensor:vi.fn()}));
vi.mock("@dnd-kit/sortable",()=>({sortableKeyboardCoordinates:vi.fn()}));
vi.mock("@/components/board/kanban-column",()=>({KanbanColumn:({column}:{column:{cards:{id:string}[]}})=><div>{column.cards.map(c=><span key={c.id}>{c.id}</span>)}</div>}));
vi.mock("@/components/board/kanban-card",()=>({KanbanCard:()=>null}));
vi.mock("@/components/board/card-detail-dialog",()=>({CardDetailDialog:()=>null}));
vi.mock("@/components/ai/ai-create-bar",()=>({AICreateBar:()=>null}));
const board = {id:"board", columns:[{id:"a",cards:[{id:"one",title:"visible one",column_id:"a",position:0},{id:"hidden",title:"hidden",column_id:"a",position:1},{id:"three",title:"visible three",column_id:"a",position:2}]},{id:"b",cards:[]}]} as BoardWithDetails;
beforeEach(()=>{useBoardStore.setState({search:"visible",filters:[],sorts:[]})});
afterEach(()=>{cleanup();vi.unstubAllGlobals()});
const start = () => dnd.props.onDragStart({active:{id:"one",data:{current:{card:board.columns[0].cards[0]}}}});
it("persists final canonical positions under a filter and never mutates query cache cards",async()=>{
  const snapshot=structuredClone(board);const request=vi.fn().mockResolvedValue({ok:true});vi.stubGlobal("fetch",request);
  render(<KanbanBoard board={board} members={[]} onRefresh={vi.fn()} />);
  expect(screen.queryByText("hidden")).toBeNull();
  await act(async()=>{start();await dnd.props.onDragEnd({active:{id:"one"},over:{id:"three"}})});
  expect(request).toHaveBeenCalledWith("/api/cards/one",expect.objectContaining({body:JSON.stringify({column_id:"a",position:2})}));
  expect(board).toEqual(snapshot);
});
it("does not write cancelled drags, and rolls failed moves back visibly",async()=>{
  const request=vi.fn().mockResolvedValue({ok:false});vi.stubGlobal("fetch",request);
  render(<KanbanBoard board={board} members={[]} onRefresh={vi.fn()} />);
  act(()=>{start()});
  act(()=>{dnd.props.onDragOver({active:{id:"one"},over:{id:"column-b"}})});
  expect(screen.getAllByText(/^(one|three)$/).map(el=>el.textContent)).toEqual(["three","one"]);
  act(()=>{dnd.props.onDragCancel()}); expect(request).not.toHaveBeenCalled();
  expect(screen.getAllByText(/^(one|three)$/).map(el=>el.textContent)).toEqual(["one","three"]);
  await act(async()=>{start();await dnd.props.onDragEnd({active:{id:"one"},over:{id:"three"}})});
  await waitFor(()=>expect(screen.getAllByText(/^(one|three)$/).map(el=>el.textContent)).toEqual(["one","three"]));
});
