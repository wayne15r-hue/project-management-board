import { expect, it, vi } from "vitest";
const state=vi.hoisted(()=>({reads:0,inserts:[] as Record<string,unknown>[],pendingInvites:false}));
const oldColumn="20000000-0000-4000-8000-000000000001";
const doneColumn="20000000-0000-4000-8000-000000000003";
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({
 auth:{getUser:async()=>({data:{user:{id:"owner"}}})},rpc:async()=>({error:null}),
 from:(table:string)=>{
  let selection="";let inserted=false;
  const q={select:(value="")=>{selection=value;return q;},eq:()=>q,order:()=>q,limit:()=>q,
   insert:(data:Record<string,unknown>)=>{state.inserts.push(data);inserted=true;return q;},
   single:async()=>{
    if(table==="columns") return {data:{name:"Done"},error:null};
    if(inserted) {
      if(state.pendingInvites&&state.inserts.at(-1)?.assignee_id)return {data:null,error:{code:"PT409"}};
      return {data:{id:"copy"},error:null};
    }
    if(selection==="position")return {data:{position:0},error:null};
    state.reads++;
    return {data:{id:"card",board_id:"board",column_id:state.reads===1?oldColumn:doneColumn,position:0,title:"Recurring task",description:null,priority:"high",due_date:"2026-11-02T00:00:00Z",assignee_id:state.pendingInvites?"member":null,created_by:"owner",recurrence_rule:"weekly",is_blocked:true,blocked_reason:"Original dependency"},error:null};
   },
   then:(resolve:(value:unknown)=>unknown)=>Promise.resolve(resolve({data:table==="columns"?[{id:oldColumn,position:0},{id:doneColumn,position:1}]:[],error:null})),
  };return q;
 },
})}));
vi.mock("@/lib/activity",()=>({logActivity:async()=>{}}));
vi.mock("@/lib/notifications",()=>({createNotification:async()=>{}}));
import { PATCH } from "@/app/api/cards/[cardId]/route";
it("creates a completed recurring blocked task's next occurrence unblocked",async()=>{
 const response=await PATCH(new Request("https://app.test",{method:"PATCH",body:JSON.stringify({column_id:doneColumn})}),{params:Promise.resolve({cardId:"card"})});
 expect(response.status).toBe(200);
 expect(state.inserts).toEqual([expect.objectContaining({column_id:oldColumn,recurrence_parent_id:"card",recurrence_rule:"weekly",is_blocked:false,blocked_reason:null})]);
});

it("creates the next occurrence unassigned if invitations are pending",async()=>{
 state.reads=0;
 state.inserts=[];
 state.pendingInvites=true;
 const response=await PATCH(new Request("https://app.test",{method:"PATCH",body:JSON.stringify({column_id:doneColumn})}),{params:Promise.resolve({cardId:"card"})});
 expect(response.status).toBe(200);
 expect(state.inserts.map(copy=>copy.assignee_id)).toEqual(["member",null]);
});
