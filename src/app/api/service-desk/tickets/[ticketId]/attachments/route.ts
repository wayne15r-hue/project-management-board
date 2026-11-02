import { NextResponse } from 'next/server';
import { deskSession, deskError, invalid, unauthorized } from '@/lib/service-desk/server';
import { uuid } from '@/lib/service-desk/validation';
export async function POST(request:Request,{params}:{params:Promise<{ticketId:string}>}) {
 const {client,user}=await deskSession();if(!user)return unauthorized();
 const {ticketId}=await params;if(!uuid.safeParse(ticketId).success)return invalid();
 const form=await request.formData().catch(()=>null);const file=form?.get('file');
 const operationId=form?.get('operationId');const revision=Number(form?.get('expectedRevision'));
 if(!(file instanceof File)||file.size<1||file.size>10*1024*1024||!uuid.safeParse(operationId).success||!Number.isInteger(revision)||revision<1)return invalid('Choose a file up to 10 MB and refresh the ticket before retrying');
 const path=`${ticketId}/${operationId}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_').slice(-180)}`;
 const payload={operationId,expectedRevision:revision,storagePath:path,fileName:file.name,fileType:file.type||'application/octet-stream',fileSize:file.size};
 const {data:replayed,error:replayError}=await client.rpc('desk_replay_attachment',{p_ticket:ticketId,p_payload:payload});
 if(replayError)return deskError(replayError);
 if(replayed)return NextResponse.json(replayed,{status:201});
 const {error:upload}=await client.storage.from('desk-attachments').upload(path,file,{contentType:file.type||'application/octet-stream',upsert:false});
 // A retry may encounter the file uploaded by the same operation. The locked RPC
 // validates the immutable operation payload, so it cannot duplicate the attachment.
 if(upload&& !['409','Duplicate'].includes(String(upload.statusCode)) && !/already exists|duplicate/i.test(upload.message))return deskError({code:'22023',message:'Unable to upload attachment. Refresh and retry.'});
 const {data,error}=await client.rpc('desk_ticket_action',{p_ticket:ticketId,p_action:'attachment',p_payload:payload});
 if(error){await client.storage.from('desk-attachments').remove([path]);return deskError(error);}
 return NextResponse.json(data,{status:201});
}
