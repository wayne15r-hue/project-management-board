import {expect,it} from "vitest";
import {persistBoardMove} from "@/lib/board-move";
it("preserves the server's approval explanation on a rejected drag move",async()=>{
 const columns=[{id:"todo",cards:[{id:"c",column_id:"todo",position:0}]}] as Parameters<typeof persistBoardMove>[0];
 const request=async()=>new Response(JSON.stringify({error:"Approval required before completion"}),{status:409});
 await expect(persistBoardMove(columns,"c",request)).rejects.toThrow("Approval required before completion");
});
