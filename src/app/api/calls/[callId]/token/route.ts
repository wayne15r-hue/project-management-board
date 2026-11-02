import {NextResponse} from 'next/server';
import {z} from 'zod';
import {AccessToken,TrackSource} from 'livekit-server-sdk';
import {createClient} from '@/lib/supabase/server';
import {callConfiguration} from '@/lib/calls/config';
import {drainMediaCleanup} from '@/lib/calls/cleanup';

export async function POST(_request:Request,{params}:{params:Promise<{callId:string}>}) {
 const client=await createClient();const {data:{user}}=await client.auth.getUser();
 const headers={'Cache-Control':'no-store'};
 if(!user)return NextResponse.json({error:'Unauthorized'},{status:401,headers});
 const {callId}=await params;
 if(!z.uuid().safeParse(callId).success)return NextResponse.json({error:'Invalid call ID'},{status:400,headers});
 const config=callConfiguration();if(!config?.enabled)return NextResponse.json({error:'Audio calling is not enabled yet.'},{status:503,headers});
 const {data:access,error}=await client.rpc('audio_call_access',{p_call_id:callId});
 if(error||!access)return NextResponse.json({error:'Call access denied.'},{status:error?.code==='42501'?403:500,headers});
 if(access.kind==='group'&&!config.groupEnabled)return NextResponse.json({error:'Group audio is not enabled yet.'},{status:503,headers});
 if(!await drainMediaCleanup(access.room))return NextResponse.json({error:'Finishing previous call access changes. Retry shortly.'},{status:503,headers});
 const token=new AccessToken(config.key,config.secret,{identity:access.identity,ttl:120});
 token.addGrant({room:access.room,roomJoin:true,canPublish:true,canPublishSources:[TrackSource.MICROPHONE],canSubscribe:true,canPublishData:false,canUpdateOwnMetadata:false});
 const jwt=await token.toJwt();
 // Signing is local, but removal/leave can race either authorization query.
 const checked=await client.rpc('audio_call_access',{p_call_id:callId});
 if(checked.error||checked.data?.identity!==access.identity||checked.data?.room!==access.room)return NextResponse.json({error:'Call access changed. Please rejoin.'},{status:403,headers});
 return NextResponse.json({token:jwt,url:config.url},{headers});
}
