import {RoomServiceClient} from 'livekit-server-sdk';
import {createAdminClient} from '@/lib/supabase/admin';
import {callConfiguration} from './config';

/** A durable outbox survives process/network failure after membership commits. */
export async function drainMediaCleanup(room?:string,deadline=Date.now()+20000):Promise<boolean> {
 const config=callConfiguration();if(!config)return false;
 const admin=createAdminClient();
 // Empty rooms need no exclusive worker. In particular, a new call must not
 // fail token issuance because a dashboard poll is draining a different room.
 let probe=admin.from('audio_media_cleanup').select('id').limit(1);
 if(room)probe=probe.eq('room_name',room);
 const pending=await probe;
 if(pending.error)return false;
 if(!pending.data?.length)return true;
 const {data:lease,error:leaseError}=await admin.rpc('audio_cleanup_claim');
 if(leaseError||!lease)return false;
 try {
 let query=admin.from('audio_media_cleanup').select('id,room_name,identity').order('position').limit(25);
 if(room)query=query.eq('room_name',room);
 const {data,error}=await query;if(error)return false;
 const service=new RoomServiceClient(config.httpUrl,config.key,config.secret,{requestTimeout:5});
 for(const entry of data??[]) {
  if(Date.now()>deadline)return false;
  try {
   if(entry.identity)await service.removeParticipant(entry.room_name,entry.identity,{revokeTokenTs:BigInt(Math.floor(Date.now()/1000)+5)});
   else await service.deleteRoom(entry.room_name);
  }catch(error){
   // Explicit Cloud revocation succeeds even if the participant is absent.
   // A missing room is already deleted. Other failures stay queued.
   if(entry.identity||!(error instanceof Error)||!('code' in error)||error.code!=='not_found')return false;
  }
  const {error:removeError}=await admin.from('audio_media_cleanup').delete().eq('id',entry.id);
  if(removeError)return false;
 }
 return (data?.length??0)<25;
 }finally{try{await admin.rpc('audio_cleanup_release',{p_owner:lease});}catch{/* The lease expires if the database is offline. */}}
}
