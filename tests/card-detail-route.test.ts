import { expect, it, vi } from "vitest";
const state=vi.hoisted(()=>({select:vi.fn()}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({from:()=>({select:(projection:string)=>{
  state.select(projection);
  return {eq:()=>({single:async()=>({data:{id:"task",card_labels:projection.includes("card_labels")?[{label:{id:"label",name:"Urgent",color:"red"}}]:undefined},error:null})})};
}})})}));
vi.mock("@/lib/activity",()=>({logActivity:vi.fn()}));
vi.mock("@/lib/notifications",()=>({createNotification:vi.fn()}));
import { GET } from "@/app/api/cards/[cardId]/route";
it("returns the selected task's labels for editors outside a board view",async()=>{
  const res=await GET(new Request("https://app.test/api/cards/task"),{params:Promise.resolve({cardId:"task"})});
  expect((await res.json()).card_labels).toEqual([{label:{id:"label",name:"Urgent",color:"red"}}]);
});
