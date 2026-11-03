import { createHash,randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { leaveSession,unauthorized,invalid,leaveError } from '@/lib/leave-desk/server';
import { uuid } from '@/lib/leave-desk/validation';
import { createAdminClient } from '@/lib/supabase/admin';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const {client,user}=await leaveSession();if(!user)return unauthorized();const {id}=await params;if(!uuid.safeParse(id).success)return invalid();
 const form=await request.formData().catch(()=>null),file=form?.get('file'),fileId=form?.get('key')??randomUUID();
 if(!(file instanceof File)||!uuid.safeParse(fileId).success||file.size<1||file.size>10485760||!['application/pdf','image/jpeg','image/png'].includes(file.type))return invalid('Choose a PDF, JPEG or PNG file up to 10 MB.');
 const bytes=new Uint8Array(await file.arrayBuffer());
 const matches=file.type==='application/pdf'?Buffer.from(bytes.slice(0,5)).toString()==='%PDF-':file.type==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v);
 if(!matches)return invalid('The file contents do not match its PDF, JPEG or PNG format.');
 const payload={id:fileId as string,name:file.name.slice(0,200),path:`${id}/${fileId}`,mime:file.type,size:file.size,sha256:createHash('sha256').update(bytes).digest('hex')};
 const {data:existing,error:lookup}=await client.from('leave_files').select('id,name,path,mime,size,sha256').eq('id',fileId).eq('request_id',id).maybeSingle();
 if(lookup)return leaveError(lookup);
 if(existing){
  if((['name','path','mime','size','sha256'] as const).some(k=>existing[k]!==payload[k]))return NextResponse.json({error:'This upload key was already used for another file.'},{status:409});
  return NextResponse.json(existing,{status:201,headers:{'Cache-Control':'private, no-store'}});
 }
 const {error:upload}=await client.storage.from('leave-files').upload(payload.path,bytes,{contentType:file.type,upsert:false});
 if(upload){
  if(!['409','Duplicate'].includes(String(upload.statusCode))&&!/already exists|duplicate/i.test(upload.message))return NextResponse.json({error:'Unable to upload this file. Please retry.'},{status:400});
  // A prior upload may have committed before registration failed. Reauthorize
  // before reading that private orphan, then compare bytes rather than trusting
  // a storage conflict or caller-supplied digest. Never overwrite the object.
  const {data:allowed,error:access}=await client.rpc('leave_can_read',{p_request:id});
  if(access)return leaveError(access);if(allowed!==true)return NextResponse.json({error:'Attachment access denied'},{status:403});
  const {data:stored,error:download}=await createAdminClient().storage.from('leave-files').download(payload.path);
  if(download||!stored)return NextResponse.json({error:'Unable to verify the earlier upload. Please retry.'},{status:409});
  if(stored.size!==file.size||createHash('sha256').update(new Uint8Array(await stored.arrayBuffer())).digest('hex')!==payload.sha256)return NextResponse.json({error:'This upload key was already used for different file contents.'},{status:409});
 }
 const {data,error}=await client.rpc('leave_register_file',{p_request:id,p_payload:payload});
 // Keep an unregistered private object on failure. Deleting could remove an object
 // concurrently registered by another request; metadata is required for downloads.
 return error?leaveError(error):NextResponse.json(data,{status:201,headers:{'Cache-Control':'private, no-store'}});
}
