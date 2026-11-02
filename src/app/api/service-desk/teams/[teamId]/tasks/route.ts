import { NextResponse } from 'next/server';
import { deskSession, deskError, invalid, unauthorized } from '@/lib/service-desk/server';
import { uuid } from '@/lib/service-desk/validation';
export async function GET(request:Request,{params}:{params:Promise<{teamId:string}>}){
 const {client,user}=await deskSession();if(!user)return unauthorized();const {teamId}=await params;if(!uuid.safeParse(teamId).success)return invalid();
 const {data:support,error}=await client.rpc('desk_is_support',{p_team:teamId});if(error)return deskError(error);if(!support)return NextResponse.json({error:'Support access required'},{status:403});
 const {data:boards,error:boardError}=await client.from('board_teams').select('board_id').eq('team_id',teamId);if(boardError)return deskError(boardError);
 const ids=(boards??[]).map(b=>b.board_id);if(!ids.length)return NextResponse.json({tasks:[]});
 const search=(new URL(request.url).searchParams.get('search')??'').trim();if(search.length>200)return invalid();
 let query=client.from('cards').select('id,title').in('board_id',ids).order('title').order('id').limit(50);
 if(search)query=query.ilike('title',`%${search.replace(/[\\%_]/g,'\\$&')}%`);
 const result=await query;return result.error?deskError(result.error):NextResponse.json({tasks:result.data??[]});
}
