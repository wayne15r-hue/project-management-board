import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ user: { id: "user" } as {id:string}|null, calls: [] as unknown[], error: null as null|{code:string;message:string} }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({
  auth: { getUser: async () => ({ data: { user: state.user } }) },
  rpc: async (name: string, args: unknown) => { state.calls.push({name,args}); return { data: { required: true }, error: state.error }; },
}) }));
import { GET, POST } from "@/app/api/cards/[cardId]/approval/route";
const cardId="30000000-0000-4000-8000-000000000001";
const params={params:Promise.resolve({cardId})};
const payload={action:"request",operationId:"90000000-0000-4000-8000-000000000001",expectedRevision:1,reviewDueDate:"2099-01-01"};
const post=(body:unknown)=>POST(new Request("https://app.test",{method:"POST",body:JSON.stringify(body)}),params);
beforeEach(()=>{state.user={id:"user"};state.calls=[];state.error=null;});
it("requires authentication before approval reads or transitions",async()=>{
 state.user=null;expect((await GET(new Request("https://app.test"),params)).status).toBe(401);expect((await post(payload)).status).toBe(401);expect(state.calls).toEqual([]);
});
it("validates UUID/revision/calendar deadlines and required change reasons before RPC",async()=>{
 for(const body of [{...payload,operationId:"bad"},{...payload,expectedRevision:0},{...payload,reviewDueDate:"2099-02-30"},{...payload,action:"request_changes",requestId:cardId,note:"  "},{...payload,action:"configure",required:false,reviewerId:null,reason:"x".repeat(2001)}]) expect((await post(body)).status).toBe(400);
 expect(state.calls).toEqual([]);
});
it("passes stable operation payloads to transactional authority and returns refreshed details",async()=>{
 expect((await GET(new Request("https://app.test"),params)).status).toBe(200);
 expect((await post(payload)).status).toBe(200);
 expect(state.calls).toEqual([{name:"get_card_approval",args:{p_card_id:cardId}},{name:"transition_card_approval",args:{p_card_id:cardId,p_action:"request",p_payload:{operationId:payload.operationId,expectedRevision:1,reviewDueDate:"2099-01-01"}}}]);
});
it.each([["40001",409],["23514",409],["42501",403],["22023",400],["XX000",500]])("maps %s to HTTP %s",async(code,status)=>{
 state.error={code,message:code==="XX000"?"private internals":"Review changed"};const response=await post(payload);expect(response.status).toBe(status);if(status===500)expect(await response.text()).not.toContain("private internals");else expect(await response.text()).toContain("Review changed");
});
