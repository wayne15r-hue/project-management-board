// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { TableView } from "../../src/components/table-view/data-table";
import { CalendarView } from "../../src/components/board/calendar-view";
import { useBoardStore } from "../../src/stores/board-store";
import type { BoardWithDetails } from "../../src/types";
const editor=vi.hoisted(()=>({update: null as null | ((id:string,data:unknown)=>Promise<void>),remove:null as null | ((id:string)=>Promise<void>)}));
vi.mock("@/components/board/card-detail-dialog",()=>({CardDetailDialog:({onUpdate,onDelete}:{onUpdate:typeof editor.update;onDelete:typeof editor.remove})=>{editor.update=onUpdate;editor.remove=onDelete;return null}}));
const board={id:"board",columns:[{id:"a",name:"A",cards:[{id:"z",title:"Zebra",priority:"medium",created_at:"2026-01-01",due_date:null}]},{id:"b",name:"B",cards:[{id:"a",title:"Alpha",priority:"high",created_at:"2026-01-01",due_date:null}]}]} as BoardWithDetails;
beforeEach(()=>useBoardStore.setState({filters:[],search:"",sorts:[]}));
afterEach(()=>{cleanup();vi.unstubAllGlobals()});
it.each(["asc","desc"] as const)("sorts table cards globally across columns (%s), including secondary fields on absent dates",dir=>{
  useBoardStore.setState({sorts:[{id:"date",field:"due_date",dir:"asc"},{id:"title",field:"title",dir}]});
  render(<TableView board={board} members={[]} onRefresh={vi.fn()} />);
  expect(screen.getAllByText(/^(Zebra|Alpha)$/).map(el=>el.textContent)).toEqual(dir==="asc"?["Alpha","Zebra"]:["Zebra","Alpha"]);
});
it.each([TableView, CalendarView])("propagates HTTP errors through %s editor callbacks", async View=>{
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:false}));
  render(<View board={board} members={[]} onRefresh={vi.fn()} />);
  await expect(editor.update!("a",{title:"draft"})).rejects.toThrow();
  await expect(editor.remove!("a")).rejects.toThrow();
});
