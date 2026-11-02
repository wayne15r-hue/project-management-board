import {NextResponse} from 'next/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {callConfiguration} from '@/lib/calls/config';
import {drainMediaCleanup} from '@/lib/calls/cleanup';
export const maxDuration=40;
// Public fixed-purpose trigger for pg_net. No request data controls its work,
// and its response never exposes call, room, participant, or outbox metadata.
export async function POST(){
 if(!callConfiguration())return NextResponse.json({ok:false},{status:503});
 const {error}=await createAdminClient().rpc('audio_maintenance');
 if(error)return NextResponse.json({ok:false},{status:503});
 const deadline=Date.now()+25000;
 for(let batch=0;batch<4&&Date.now()<deadline;batch++)if(await drainMediaCleanup(undefined,deadline))return NextResponse.json({ok:true});
 return NextResponse.json({ok:false},{status:503});
}
