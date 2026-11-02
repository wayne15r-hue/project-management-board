import { beforeEach, expect, it, vi } from "vitest";
const state=vi.hoisted(()=>({calls:[] as unknown[],error:null as null|{code:string,message:string}}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({rpc:async(name:string,args:unknown)=>{state.calls.push({name,args});return {data:{id:"created"},error:state.error};}})}));
import { PATCH, POST } from "@/app/api/boards/[boardId]/columns/route";
const boardId="10000000-0000-4000-8000-000000000001";
const col="20000000-0000-4000-8000-000000000001";
const context={params:Promise.resolve({boardId})};
const req=(body:unknown)=>new Request("https://app.test",{method:"POST",body:JSON.stringify(body)});
beforeEach(()=>{state.calls=[];state.error=null;});
it("updates the full column batch in one database transaction",async()=>{
 const columns=[{id:col,name:"Ready",position:0}];
 expect((await PATCH(req({columns}),context)).status).toBe(200);
 expect(state.calls).toEqual([{name:"update_board_columns",args:{p_board_id:boardId,p_columns:columns}}]);
});
it("creates columns under the same board lock as classification checks",async()=>{
 expect((await POST(req({name:"Ready"}),context)).status).toBe(201);
 expect(state.calls).toEqual([{name:"create_board_column",args:{p_board_id:boardId,p_name:"Ready",p_color:null}}]);
});
it("returns a useful conflict for rejected implicit task transitions",async()=>{
 state.error={code:"23514",message:"Handle affected tasks explicitly first"};
 const response=await PATCH(req({columns:[{id:col,position:1}]}),context);
 expect(response.status).toBe(409);expect(await response.text()).toContain("Handle affected tasks");
});
