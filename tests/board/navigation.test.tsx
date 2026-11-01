// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import BoardPage from "../../src/app/(dashboard)/dashboard/board/[boardId]/page";
import { useBoardStore } from "../../src/stores/board-store";

const state = vi.hoisted(()=>({id:"board-a",params:new URLSearchParams(),replace:vi.fn(),cardId:"12345678-1234-1234-1234-123456789abc"}));
vi.mock("next/navigation",()=>({useParams:()=>({boardId:state.id}),usePathname:()=>`/dashboard/board/${state.id}`,useSearchParams:()=>state.params,useRouter:()=>({replace:state.replace})}));
vi.mock("@tanstack/react-query",()=>({useQuery:({queryKey}:{queryKey:string[]})=>({data:queryKey[0]==="members"?[]:{id:state.id,name:"Board",columns:[{id:"col",cards:[{id:state.cardId,title:"Hidden notification card",description:null}]}]},isLoading:false,refetch:vi.fn()})}));
vi.mock("@/hooks/use-realtime-cards",()=>({useRealtimeCards:vi.fn()}));
vi.mock("@/hooks/use-board-presence",()=>({useBoardPresence:()=>[]}));
vi.mock("@/components/board/board-header",()=>({BoardHeader:()=>null}));
vi.mock("@/components/board/kanban-board",()=>({KanbanBoard:()=>null}));
vi.mock("@/components/table-view/data-table",()=>({TableView:()=>null}));
vi.mock("@/components/board/calendar-view",()=>({CalendarView:()=>null}));
vi.mock("@/components/timeline-view/gantt-chart",()=>({GanttChart:()=>null}));
vi.mock("@/components/analytics/board-analytics",()=>({BoardAnalytics:()=>null}));
vi.mock("@/components/board/card-detail-dialog",()=>({CardDetailDialog:({card,open}:{card:{title:string}|null;open:boolean})=>open?<div>{card?.title}</div>:null}));
beforeEach(()=>{state.id="board-a";state.params=new URLSearchParams();state.replace.mockClear();useBoardStore.setState({search:"",filters:[],sorts:[],activeView:"kanban"})});
afterEach(cleanup);
describe("board URL navigation",()=>{
  it("hydrates switching boards and browser back/forward without replace loops",async()=>{
    state.params=new URLSearchParams({q:"first"}); const view=render(<BoardPage />);
    await waitFor(()=>expect(useBoardStore.getState().search).toBe("first"));expect(state.replace).not.toHaveBeenCalled();
    state.id="board-b";state.params=new URLSearchParams({q:"second",filter:"null"});view.rerender(<BoardPage />);
    await waitFor(()=>expect(useBoardStore.getState().search).toBe("second"));expect(useBoardStore.getState().filters).toEqual([]);
    state.params=new URLSearchParams({q:"back"});view.rerender(<BoardPage />);
    await waitFor(()=>expect(useBoardStore.getState().search).toBe("back"));
    state.params=new URLSearchParams({q:"second"});view.rerender(<BoardPage />);
    await waitFor(()=>expect(useBoardStore.getState().search).toBe("second"));expect(state.replace).not.toHaveBeenCalled();
  });
  it.each(["kanban","table","calendar"] as const)("opens authorized hidden notification cards in %s and retains target on filter changes",async(activeView)=>{
    state.params=new URLSearchParams({card:state.cardId,q:"unmatched",custom:"retain"});useBoardStore.setState({activeView});render(<BoardPage />);
    await screen.findByText("Hidden notification card");
    act(()=>useBoardStore.getState().setSearch("changed"));
    expect(state.replace).toHaveBeenCalled();
    const url=state.replace.mock.calls.at(-1)![0] as string;const params=new URLSearchParams(url.split("?")[1]);
    expect(params.get("card")).toBe(state.cardId);expect(params.get("custom")).toBe("retain");expect(params.get("q")).toBe("changed");
  });
  it("does not open cards absent from the authorized board response",()=>{
    state.params=new URLSearchParams({card:"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"});render(<BoardPage />);
    expect(screen.queryByText("Hidden notification card")).toBeNull();
  });
});
