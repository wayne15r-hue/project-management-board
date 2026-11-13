"use client";
import { responseError } from "@/lib/response-error";


import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CalendarDays, CheckSquare, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardDetailDialog } from "@/components/board/card-detail-dialog";
import { createClient } from "@/lib/supabase/client";
import { useBoardSharing } from "@/hooks/use-board-sharing";
import { cn } from "@/lib/utils";
import type { BoardWithDetails, Card } from "@/types";
import type { MyWorkItem, MyWorkResponse } from "@/types/my-work";
import { MyWorkTickets } from '@/components/service-desk/my-work-tickets';
import { MyWorkLeave } from '@/components/leave-desk/my-work-leave';

async function read<T>(url:string,signal:AbortSignal):Promise<T> {
  const response=await fetch(url,{signal,cache:"no-store"});
  if(!response.ok) throw new Error("Unable to load your work. Please try again.");
  return response.json();
}

const groups=[ ["overdue","Overdue"],["today","Today"],["upcoming","Upcoming"],["undated","No Due Date"] ] as const;

export function MyWork({userId}:{userId:string}) {
  const client=useQueryClient();
  const [validAccount,setValidAccount]=useState(true);
  useEffect(()=>{
    const {data:{subscription}}=createClient().auth.onAuthStateChange((_event,session)=>{
      if(session?.user.id===userId) return;
      setValidAccount(false);
      void client.cancelQueries({queryKey:["my-work",userId]}).then(()=>{
        client.removeQueries({queryKey:["my-work",userId]});
      });
    });
    return ()=>subscription.unsubscribe();
  },[client,userId]);
  if(!validAccount)return <p role="status" className="p-6 text-sm">Updating your session…</p>;
  return <><MyWorkContent key={userId} userId={userId}/><div className="mx-auto w-full max-w-6xl px-4 md:px-6"><MyWorkTickets key={userId} userId={userId}/><MyWorkLeave key={`leave-${userId}`} userId={userId}/></div></>;
}

function MyWorkContent({userId}:{userId:string}) {
  const client=useQueryClient();
  const [tab,setTab]=useState<"mine"|"attention">("mine");
  const [board,setBoard]=useState("");
  const [search,setSearch]=useState("");
  const [page,setPage]=useState(1);
  const [selected,setSelected]=useState<MyWorkItem|null>(null);
  const [boards,setBoards]=useState<{id:string;name:string}[]>([]);
  const [timezone]=useState(()=>{
    try{return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";}catch{return "UTC";}
  });
  const params=new URLSearchParams({tab,search,timezone,page:String(page)});
  if(board)params.set("board",board);
  const work=useQuery({
    queryKey:["my-work",userId,"list",tab,board,search,timezone,page],
    queryFn:({signal})=>read<MyWorkResponse>(`/api/my-work?${params}`,signal),
    gcTime:0,staleTime:0,refetchOnWindowFocus:"always",
    refetchInterval:60_000,refetchIntervalInBackground:false,
  });
  const {refetch}=work;
  // Re-evaluate local day boundaries immediately when a background tab is restored.
  useEffect(()=>{
    const visible=()=>{if(document.visibilityState==="visible")void refetch();};
    document.addEventListener("visibilitychange",visible);
    return ()=>document.removeEventListener("visibilitychange",visible);
  },[refetch]);
  const data=work.data;
  const [previousData,setPreviousData]=useState<MyWorkResponse>();
  if(data&&data!==previousData){
    setPreviousData(data);setBoards(data.boards);
    if(page>Math.max(1,Math.ceil(data.total/50)))setPage(Math.max(1,Math.ceil(data.total/50)));
  }
  const countItems=[
    ["Overdue",data?.counts.overdue,AlertCircle],
    ["Due Today",data?.counts.dueToday,CalendarDays],
    ["Blocked",data?.counts.blocked,AlertCircle],
    ["Total Open",data?.counts.totalOpen,CheckSquare],
    ["Pending My Review",data?.counts.pendingMyReview??0,CheckSquare],
  ] as const;
  const sections=tab==="mine"?groups.map(([key,label])=>({label,items:data?.items.filter(item=>item.group===key)??[]})):[{label:"Needs Attention",items:data?.items??[]}];
  return <div className="mx-auto w-full max-w-6xl px-4 py-5 md:px-6 md:py-7">
    <header className="workspace-page-intro mb-5 flex items-start justify-between gap-3">
      <div><h1>My Work</h1><p className="mt-2 text-sm text-muted-foreground">Your next steps, across your boards.</p></div>
      <Button variant="outline" size="sm" aria-label="Refresh tasks" disabled={work.isFetching} onClick={()=>void work.refetch()}><RefreshCw className={cn("h-4 w-4",work.isFetching&&"animate-spin")} /><span className="hidden sm:inline">Refresh</span></Button>
    </header>
    <div role="tablist" aria-label="Work lists" className="mb-4 inline-flex max-w-full flex-wrap gap-1 rounded-xl border bg-card p-1">
      {([ ["mine","My Work"],["attention","Needs Attention"] ] as const).map(([value,label])=><button key={value} type="button" role="tab" id={`work-tab-${value}`} aria-selected={tab===value} tabIndex={tab===value?0:-1} aria-controls="work-panel" className={cn("min-h-10 rounded-lg px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring sm:px-4",tab===value?"bg-accent font-semibold text-accent-foreground":"text-muted-foreground hover:bg-muted hover:text-foreground")} onClick={()=>{setTab(value);setPage(1);}} onKeyDown={event=>{
        if(!["ArrowLeft","ArrowRight","Home","End"].includes(event.key))return;
        event.preventDefault();
        const next=event.key==="Home"?"mine":event.key==="End"?"attention":value==="mine"?"attention":"mine";
        setTab(next);setPage(1);
        event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`#work-tab-${next}`)?.focus();
      }}>{label}</button>)}
    </div>
    <div role="tabpanel" id="work-panel" aria-labelledby={`work-tab-${tab}`}>
      <p className="mb-4 text-sm text-muted-foreground">{tab==="mine"?"Open tasks assigned to you.":"Overdue or blocked tasks assigned to you or on boards you own, plus pending reviews assigned to you."}</p>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {countItems.map(([label,value,Icon])=><div key={label} className="rounded-2xl border border-border bg-card p-3.5"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="size-4 shrink-0 text-primary" aria-hidden="true"/>{label}</div><p className="mt-2 text-2xl font-semibold tabular-nums">{work.isError?"—":value??"…"}</p></div>)}
      </div>
      <div className="mb-5 flex flex-col gap-2 rounded-2xl border bg-card p-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-3.5 size-4 text-muted-foreground" aria-hidden="true" />
          <input aria-label="Search tasks" placeholder="Search task titles…" value={search} maxLength={200} onChange={e=>{setSearch(e.target.value);setPage(1);}} className="h-11 w-full rounded-xl border border-input bg-background pr-3 pl-9 text-sm focus-visible:outline-2 focus-visible:outline-ring"/>
        </div>
        <select aria-label="Filter by board" value={board} onChange={e=>{setBoard(e.target.value);setPage(1);}} className="h-11 max-w-full rounded-xl border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring sm:max-w-64"><option value="">All boards</option>{boards.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select>
      </div>
      {work.isPending&&<div role="status" className="rounded-xl border border-border p-8 text-sm text-muted-foreground">Loading your work…</div>}
      {work.isError?<div role="alert" className="rounded-xl border border-destructive/30 p-6"><p className="mb-3 text-sm">We couldn&apos;t load your work. Your tasks have not changed.</p><Button variant="outline" onClick={()=>void work.refetch()}>Retry</Button></div>:data&&<>
        {data.total===0 ? (
          <div className="rounded-2xl border border-dashed bg-card p-8 text-center">
            <div className="mx-auto mb-3 grid size-11 place-items-center rounded-xl bg-accent text-accent-foreground"><CheckSquare className="size-5" aria-hidden="true" /></div>
            <p className="font-semibold">{search||board?"No matching tasks":tab==="attention"?"Nothing needs attention":"No open assignments"}</p>
            <p className="mt-2 text-sm text-muted-foreground">{search||board?"Try another search or board.":tab==="attention"?"No overdue, blocked or pending review tasks in this view.":"Tasks assigned to you will appear here."}</p>
          </div>
        ) : sections.filter(section=>section.items.length>0).map(section=>(
          <section key={section.label} className="mb-5 overflow-hidden rounded-2xl border bg-card">
            <h2 className="border-b bg-muted/45 px-4 py-3 text-sm font-semibold">{section.label}</h2>
            <ul className="divide-y divide-border">
              {section.items.map(item=><WorkRow key={item.id} item={item} timezone={timezone} onOpen={()=>setSelected(item)}/>)}
            </ul>
          </section>
        ))}
        {data.total>0&&<div className="flex flex-wrap items-center justify-between gap-3 text-sm"><p className="text-muted-foreground">{(page-1)*50+1}–{Math.min(page*50,data.total)} of {data.total} tasks</p><div className="flex items-center gap-2"><Button variant="outline" size="sm" aria-label="Previous page" disabled={page===1||work.isFetching} onClick={()=>setPage(p=>p-1)}>Previous</Button><span>Page {page}</span><Button variant="outline" size="sm" aria-label="Next page" disabled={page*50>=data.total||work.isFetching} onClick={()=>setPage(p=>p+1)}>Next</Button></div></div>}
      </>}
    </div>
    {selected&&<WorkEditor key={selected.id} item={selected} userId={userId} onClose={()=>setSelected(null)} onRefresh={()=>client.invalidateQueries({queryKey:["my-work",userId,"list"]})}/>}
  </div>;
}

function WorkRow({item,timezone,onOpen}:{item:MyWorkItem;timezone:string;onOpen:()=>void}){
  return <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
    <div className="min-w-0 flex-1"><button type="button" className="max-w-full break-words text-left text-sm font-medium hover:underline focus-visible:underline" onClick={onOpen}>{item.title}</button>
      <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground"><span>{item.board.name}</span><span aria-hidden="true">·</span><span>{item.column.name}</span><span aria-hidden="true">·</span><span>{item.assignee?.full_name||item.assignee?.email||"Unassigned"}</span></div>
      {item.is_blocked&&<p className="mt-2 whitespace-pre-wrap break-words text-xs text-muted-foreground">{item.blocked_reason}</p>}
      <Link href={`/dashboard/board/${item.board_id}?card=${item.id}`} className="mt-2 inline-block text-xs text-muted-foreground underline underline-offset-2">Open Board<span className="sr-only"> for {item.title}</span></Link>
    </div>
    <div className="flex shrink-0 flex-wrap items-center gap-2 text-xs">{item.pending_my_review&&<span className="rounded-md bg-primary/10 px-2 py-1 text-primary">Your review</span>}{item.approval_status&&item.approval_status!=="not_requested"&&<span className="rounded-md bg-muted px-2 py-1 capitalize">{item.approval_status.replaceAll("_"," ")}</span>}<span className={cn("rounded-md px-2 py-1 capitalize",item.priority==="high"?"bg-orange-500/10 text-orange-700 dark:text-orange-300":"bg-muted text-muted-foreground")}>{item.priority}</span>{item.is_overdue&&<span className="rounded-md bg-destructive/10 px-2 py-1 text-destructive">Overdue</span>}{item.is_blocked&&<span className="rounded-md bg-amber-500/10 px-2 py-1 text-amber-700 dark:text-amber-300">Blocked</span>}<span className="text-muted-foreground">{item.due_date?new Intl.DateTimeFormat(undefined,{timeZone:timezone,day:"numeric",month:"short",year:"numeric"}).format(new Date(item.due_date)):"No due date"}</span></div>
  </li>;
}

function WorkEditor({item,userId,onClose,onRefresh}:{item:MyWorkItem;userId:string;onClose:()=>void;onRefresh:()=>Promise<unknown>}){
  const client=useQueryClient();
  const sharing=useBoardSharing(item.board_id);
  const requests=useRef<AbortController|null>(null);
  useEffect(()=>{
    const controller=new AbortController();requests.current=controller;
    return ()=>controller.abort();
  },[]);
  const details=useQuery({
    queryKey:["my-work",userId,"editor",item.id],gcTime:0,staleTime:0,refetchOnWindowFocus:false,
    queryFn:async({signal})=>{
      const [board,card]=await Promise.all([
        read<BoardWithDetails>(`/api/boards/${item.board_id}`,signal),
        read<Card>(`/api/cards/${item.id}`,signal),
      ]);return {board,card};
    },
  });
  async function update(cardId:string,data:Partial<Card>){
    const controller=requests.current;
    if(!controller||controller.signal.aborted)throw new Error("Editor closed");
    const res=await fetch(`/api/cards/${cardId}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(data),signal:controller.signal});
    if(!res.ok)throw await responseError(res,"Failed to save task");
    const card=await res.json() as Card;
    if(controller.signal.aborted)throw new Error("Editor closed");
    client.setQueryData(["my-work",userId,"editor",item.id],(old:typeof details.data)=>old?{...old,card:{...old.card,...card}}:old);
    await Promise.all([onRefresh(),client.invalidateQueries({queryKey:["board",item.board_id]})]);
  }
  async function remove(cardId:string){
    const controller=requests.current;
    if(!controller||controller.signal.aborted)throw new Error("Editor closed");
    const res=await fetch(`/api/cards/${cardId}`,{method:"DELETE",signal:controller.signal});if(!res.ok)throw new Error("Failed to delete task");
    if(controller.signal.aborted)throw new Error("Editor closed");
    await Promise.all([onRefresh(),client.invalidateQueries({queryKey:["board",item.board_id]})]);
  }
  if(details.isPending||details.isError)return <div role={details.isError?"alert":"status"} className="fixed bottom-5 right-5 z-50 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-background p-4 shadow-lg"><p className="mb-2 text-sm">{details.isError?"Unable to open this task. It may have been removed or access changed.":"Opening task…"}</p>{details.isError&&<Button size="sm" variant="outline" onClick={()=>void details.refetch()}>Retry opening task</Button>}<Button size="sm" variant="ghost" onClick={onClose}>Close</Button></div>;
  const boardSharing=sharing.isError?undefined:sharing.data;
  const board={...details.data.board,assignmentsLocked:(boardSharing?.pendingCount??0)>0};
  return <CardDetailDialog card={details.data.card} board={board} columns={board.columns} members={boardSharing?.members??[]} open onOpenChange={open=>{if(!open)onClose();}} onUpdate={update} onDelete={remove}/>;
}
