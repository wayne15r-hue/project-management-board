import { NextResponse } from 'next/server';
import { deskSession, invalid, unauthorized } from '@/lib/service-desk/server';
import { uuid } from '@/lib/service-desk/validation';
import { createAdminClient } from '@/lib/supabase/admin';
export async function GET(_request:Request,{params}:{params:Promise<{ticketId:string;attachmentId:string}>}) {
 const {client,user}=await deskSession();if(!user)return unauthorized();
 const {ticketId,attachmentId}=await params;if(!uuid.safeParse(ticketId).success||!uuid.safeParse(attachmentId).success)return invalid();
 const {data:row,error}=await client.from('desk_attachments').select('storage_path,file_name').eq('id',attachmentId).eq('ticket_id',ticketId).maybeSingle();
 if(error)return NextResponse.json({error:'Unable to load attachment'},{status:500});
 if(!row)return NextResponse.json({error:'Attachment unavailable'},{status:404});
 // Storage SELECT is intentionally unavailable to browser clients so they cannot
 // mint signed URLs. The user's RLS-visible row authorizes this server-only read.
 const {data:blob,error:download}=await createAdminClient().storage.from('desk-attachments').download(row.storage_path);
 if(download||!blob)return NextResponse.json({error:'Attachment unavailable'},{status:404});
 return new Response(blob,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="${row.file_name.replace(/[^a-zA-Z0-9._-]/g,'_')}"; filename*=UTF-8''${encodeURIComponent(row.file_name)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
