import {beforeEach,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({entries:[] as {id:string;room_name:string;identity:string|null}[],remove:vi.fn(),drop:vi.fn(),deleted:[] as string[],queryError:false}));
vi.mock('livekit-server-sdk',()=>({RoomServiceClient:class{removeParticipant=state.remove;deleteRoom=state.drop;}}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({rpc:async()=>({data:'lease',error:null}),from:()=>{
 let deleting=false;const q={select:()=>q,order:()=>q,limit:()=>q,delete:()=>{deleting=true;return q;},eq:(_key:string,value:string)=>{if(deleting)state.deleted.push(value);return q;},then:(resolve:(value:unknown)=>void)=>resolve({data:state.entries,error:state.queryError?{message:'Unavailable'}:null})};return q;
}})}));
import {drainMediaCleanup} from '@/lib/calls/cleanup';
beforeEach(()=>{state.entries=[];state.deleted=[];state.queryError=false;state.remove.mockReset().mockResolvedValue(undefined);state.drop.mockReset().mockResolvedValue(undefined);vi.stubEnv('LIVEKIT_URL','wss://qa.livekit.cloud');vi.stubEnv('LIVEKIT_API_KEY','test');vi.stubEnv('LIVEKIT_API_SECRET','test');vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY','test');});
it('pins Cloud token revocation beyond the current second and then deletes the room',async()=>{
 state.entries=[{id:'revoke',room_name:'helios-test',identity:'opaque-session'},{id:'room',room_name:'helios-test',identity:null}];
 const before=BigInt(Math.floor(Date.now()/1000));expect(await drainMediaCleanup()).toBe(true);
 expect(state.remove.mock.calls[0].slice(0,2)).toEqual(['helios-test','opaque-session']);
 expect(state.remove.mock.calls[0][2].revokeTokenTs).toBeGreaterThan(before);
 expect(state.deleted).toEqual(['revoke','room']);
});
it('keeps failed revocations durable and does not delete the room before they succeed',async()=>{
 state.entries=[{id:'revoke',room_name:'helios-test',identity:'opaque-session'},{id:'room',room_name:'helios-test',identity:null}];state.remove.mockRejectedValue(new Error('Network down'));
 expect(await drainMediaCleanup()).toBe(false);expect(state.deleted).toEqual([]);expect(state.drop).not.toHaveBeenCalled();
});
it('fails closed when cleanup storage is unavailable or configuration is missing',async()=>{
 state.queryError=true;expect(await drainMediaCleanup()).toBe(false);vi.stubEnv('LIVEKIT_URL','wss://self-hosted.test');expect(await drainMediaCleanup()).toBe(false);
});
