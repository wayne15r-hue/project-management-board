import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
async function handle(request:Request,params:Promise<{boardId:string}>,write:boolean){
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 if(!user) return NextResponse.json({error:'Unauthorized'},{status:401});
 let body:unknown={action:'read'};
 if(write){try{body=await request.json();}catch{return NextResponse.json({error:'Invalid request'},{status:400});}}
 const {boardId}=await params;
 const {data,error}=await db.rpc('workflow_board_settings',{p_board_id:boardId,p_payload:body});
 if(error) return NextResponse.json({error:error.code==='42501'?'Board owner access required':'Invalid workflow settings'},{status:error.code==='42501'?403:400});
 return NextResponse.json(data);
}
export function GET(request:Request,{params}:{params:Promise<{boardId:string}>}){return handle(request,params,false);}
export function POST(request:Request,{params}:{params:Promise<{boardId:string}>}){return handle(request,params,true);}
