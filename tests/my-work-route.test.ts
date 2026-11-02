import { beforeEach, expect, it, vi } from "vitest";
const state=vi.hoisted(()=>({user:{id:"user"} as {id:string}|null,calls:[] as unknown[],error:null as null|{code:string,message:string}}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({auth:{getUser:async()=>({data:{user:state.user}})},rpc:async(name:string,args:unknown)=>{state.calls.push({name,args});return {data:{items:[],total:0},error:state.error};}})}));
import { GET } from "@/app/api/my-work/route";
beforeEach(()=>{state.user={id:"user"};state.calls=[];state.error=null;});
it("requires authentication and rejects invalid filters before querying",async()=>{
 state.user=null;expect((await GET(new Request("https://app.test/api/my-work"))).status).toBe(401);
 state.user={id:"user"};for(const query of ["page=0","page=1.5","page=2147483648","board=bad","tab=all",`search=${"a".repeat(201)}`]) expect((await GET(new Request(`https://app.test/api/my-work?${query}`))).status).toBe(400);
 expect(state.calls).toEqual([]);
});
it("normalizes defaults and sends literal search and invalid timezone fallback to the aggregate RPC",async()=>{
 expect((await GET(new Request("https://app.test/api/my-work?search=%20%25%20&timezone=Invalid%2FZone&page=2&tab=attention"))).status).toBe(200);
 expect(state.calls).toEqual([{name:"my_work",args:{p_tab:"attention",p_board:null,p_search:"%",p_timezone:"UTC",p_page:2}}]);
});
it("returns errors without exposing internal database details",async()=>{
 state.error={code:"XX000",message:"private internals"};const response=await GET(new Request("https://app.test/api/my-work"));
 expect(response.status).toBe(500);expect(await response.text()).not.toContain("private internals");
});
