import {NextResponse} from 'next/server';
import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';
import {callConfiguration} from '@/lib/calls/config';
import {drainMediaCleanup} from '@/lib/calls/cleanup';

const start=z.object({conversationId:z.uuid()}).strict();
const mutation=z.discriminatedUnion('action',[
 z.object({callId:z.uuid(),action:z.enum(['join','decline','cancel','leave','end','heartbeat'])}).strict(),
 z.object({callId:z.uuid(),action:z.literal('kick'),targetId:z.uuid()}).strict(),
]);
const status=(code?:string)=>code==='42501'?403:code==='22023'?400:code==='23514'||code==='23505'?409:500;
export async function GET(request:Request){
 const client=await createClient();const {data:{user}}=await client.auth.getUser();
 if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
 const conversationId=new URL(request.url).searchParams.get('conversationId');
 if(conversationId&&!z.uuid().safeParse(conversationId).success)return NextResponse.json({error:'Invalid conversation ID'},{status:400});
 const {data,error}=await client.rpc('audio_call_list',{p_conversation_id:conversationId});
 if(error)return NextResponse.json({error:'Could not load calls.'},{status:status(error.code)});
 const configured=callConfiguration();const ready=!!configured?.enabled;
 const cleaned=configured?await drainMediaCleanup():true;
 return NextResponse.json({calls:data,ready,groupReady:ready&&!!configured?.groupEnabled,mediaCleanupPending:!cleaned},{headers:{'Cache-Control':'no-store'}});
}
export async function POST(request:Request){
 const client=await createClient();const {data:{user}}=await client.auth.getUser();
 if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
 const body=start.safeParse(await request.json().catch(()=>null));
 if(!body.success)return NextResponse.json({error:'Invalid conversation ID'},{status:400});
 if(!callConfiguration()?.enabled)return NextResponse.json({error:'Audio calling is not enabled yet.'},{status:503});
 const {data,error}=await client.rpc('audio_call_start',{p_conversation_id:body.data.conversationId,p_allow_group:!!callConfiguration()?.groupEnabled});
 if(error)return NextResponse.json({error:error.message},{status:status(error.code)});
 return NextResponse.json({call:data,mediaCleanupPending:!await drainMediaCleanup()},{headers:{'Cache-Control':'no-store'}});
}
export async function PATCH(request:Request){
 const client=await createClient();const {data:{user}}=await client.auth.getUser();
 if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
 const body=mutation.safeParse(await request.json().catch(()=>null));
 if(!body.success)return NextResponse.json({error:'Invalid call action'},{status:400});
 const {data,error}=await client.rpc('audio_call_action',{p_call_id:body.data.callId,p_action:body.data.action,p_target_id:'targetId' in body.data?body.data.targetId:null});
 if(error)return NextResponse.json({error:error.message},{status:status(error.code)});
 return NextResponse.json({call:data,mediaCleanupPending:!await drainMediaCleanup()},{headers:{'Cache-Control':'no-store'}});
}
