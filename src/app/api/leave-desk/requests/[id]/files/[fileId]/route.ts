import { NextResponse } from 'next/server';
import { leaveSession,unauthorized,invalid,leaveError } from '@/lib/leave-desk/server';
import { uuid } from '@/lib/leave-desk/validation';
import { createAdminClient } from '@/lib/supabase/admin';
export async function GET(_request:Request,{params}:{params:Promise<{id:string;fileId:string}>}){
 const {client,user}=await leaveSession();if(!user)return unauthorized();const {id,fileId}=await params;if(!uuid.safeParse(id).success||!uuid.safeParse(fileId).success)return invalid();
 const {data:row,error}=await client.from('leave_files').select('path,name').eq('id',fileId).eq('request_id',id).maybeSingle();
 if(error)return leaveError(error);if(!row)return NextResponse.json({error:'Attachment unavailable'},{status:404});
 const {data:blob,error:download}=await createAdminClient().storage.from('leave-files').download(row.path);
 if(download||!blob)return NextResponse.json({error:'Attachment unavailable'},{status:404});
 return new Response(blob,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="${row.name.replace(/[^a-zA-Z0-9._-]/g,'_')}"; filename*=UTF-8''${encodeURIComponent(row.name)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
