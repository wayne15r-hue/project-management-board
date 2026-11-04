import {afterAll,afterEach,beforeAll,expect,it} from 'vitest';
import type {PGlite} from '@electric-sql/pglite';
import {asUser,database,uid,conversation} from './fixture';
let db:PGlite;
beforeAll(async()=>{db=await database({policyOnly:true});});
afterAll(async()=>{await db?.close();});
afterEach(async()=>{await db.exec("update audio_calls set state='ended',ended_at=clock_timestamp() where state<>'ended'");});
type Call={id:string;conversation_id:string;state:string;end_reason:string|null;participants:{user_id:string;media_identity:string;state:string;blocked:boolean}[]};
async function create(kind='direct'){return (await asUser(db,1,'select create_conversation($1,$2,$3) id',[kind,kind==='group'?'QA audio':null,[uid(2)]])).rows[0] as {id:string};}
async function start(id:string,actor=1){return ((await asUser(db,actor,'select audio_call_start($1) c',[id])).rows[0] as {c:Call}).c;}
async function act(id:string,action:string,actor=1,target:string|null=null){return ((await asUser(db,actor,'select audio_call_action($1,$2,$3) c',[id,action,target])).rows[0] as {c:Call}).c;}
async function finish(id:string){await act(id,'end');}
it('defaults existing callers to audio and preserves the original mode when joining an existing room',async()=>{
 const {id}=await create();const legacy=await start(id);
 expect(legacy).toMatchObject({initialMode:'audio'});await finish(legacy.id);
 const video=((await asUser(db,1,"select audio_call_start($1,true,'video') c",[id])).rows[0] as {c:Call}).c;
 expect(video).toMatchObject({initialMode:'video'});
 expect((await start(id)).id).toBe(video.id);
 expect(await start(id)).toMatchObject({initialMode:'video'});
 await expect(asUser(db,3,"select audio_call_start($1,true,'video')",[id])).rejects.toThrow(/member|Forbidden/i);
 await expect(asUser(db,1,"select audio_call_start($1,true,'invalid')",[id])).rejects.toThrow(/mode/i);
 await finish(video.id);
});
it('denies outsider start, reads, mutation and room tokens and forbids direct table writes',async()=>{
 const {id}=await create();
 await expect(start(id,3)).rejects.toThrow(/member|Forbidden/i);
 const c=await start(id);
 await expect(act(c.id,'join',3)).rejects.toThrow(/member|Forbidden/i);
 await expect(asUser(db,3,'select audio_call_access($1)',[c.id])).rejects.toThrow(/member|Forbidden/i);
 expect((await asUser(db,3,'select * from audio_calls')).rows).toEqual([]);
 await expect(asUser(db,1,"update audio_calls set state='ended' where id=$1",[c.id])).rejects.toThrow(/permission denied/i);
 await finish(c.id);
});
it('rings only direct participants, accepts idempotently, and makes hangup terminal',async()=>{
 const {id}=await create(); const c=await start(id);
 expect(c.state).toBe('ringing');expect(c.participants.map(p=>p.state).sort()).toEqual(['invited','joined']);
 await expect(asUser(db,2,'select audio_call_access($1)',[c.id])).rejects.toThrow(/join|accept/i);
 expect((await act(c.id,'join',2)).state).toBe('active');
 expect((await act(c.id,'join',2)).state).toBe('active');
 const access=((await asUser(db,2,'select audio_call_access($1) a',[c.id])).rows[0] as {a:{identity:string;room:string}}).a;
 expect(access.identity).not.toBe(uid(2));expect(access.room).toBe('helios-'+c.id);
 expect((await db.query('select user_id from audio_call_participants where media_identity=$1',[access.identity])).rows).toEqual([{user_id:uid(2)}]);
 expect((await act(c.id,'leave',2)).end_reason).toBe('ended');
 expect((await act(c.id,'leave',2)).state).toBe('ended');
 await expect(act(c.id,'join',2)).rejects.toThrow(/ended/i);
});
it('retains cancelled, declined, missed and busy outcomes in call history',async()=>{
 const {id}=await create();let c=await start(id);expect((await act(c.id,'cancel')).end_reason).toBe('cancelled');
 c=await start(id);expect((await act(c.id,'decline',2)).end_reason).toBe('declined');
 c=await start(id);await db.query("update audio_calls set created_at=now()-interval '1 minute' where id=$1",[c.id]);
 const history=(await asUser(db,2,'select audio_call_list($1) calls',[id])).rows[0] as {calls:Call[]};
 expect(history.calls.find(x=>x.id===c.id)?.end_reason).toBe('missed');
 const other=(await asUser(db,3,"select create_conversation('direct',null,$1) id",[[uid(2)]])).rows[0] as {id:string};
 const busy=await start(other.id,3);const attempt=await start(id);expect(attempt.end_reason).toBe('busy');await act(busy.id,'cancel',3);
});
it('rejects caller decline, recipient cancel and unknown actions without changing the call',async()=>{
 const {id}=await create();const c=await start(id);
 for(const [action,actor] of [['cancel',2],['decline',1],['invented',1]] as const)await expect(act(c.id,action,actor)).rejects.toThrow();
 expect((await act(c.id,'heartbeat')).state).toBe('ringing');await finish(c.id);
});
it('supports group joining and leaving, final hangup, admin removal and blocked token access',async()=>{
 const {id}=await create('group');const c=await start(id);expect(c.state).toBe('active');
 await act(c.id,'join',2);await expect(act(c.id,'kick',2,uid(1))).rejects.toThrow(/admin|Forbidden/i);
 await act(c.id,'kick',1,uid(2));
 await expect(act(c.id,'join',2)).rejects.toThrow(/removed|blocked/i);
 await expect(asUser(db,2,'select audio_call_access($1)',[c.id])).rejects.toThrow();
 expect((await act(c.id,'leave')).state).toBe('ended');
 expect((await db.query('select room_name,identity from audio_media_cleanup where identity=$1',[c.participants.find(p=>p.user_id===uid(2))!.media_identity])).rows.length).toBeGreaterThan(0);
});
it('revokes call access on group removal and queues server-side disconnection',async()=>{
 const {id}=await create('group');const c=await start(id);await act(c.id,'join',2);
 await asUser(db,1,"select manage_group($1,'remove',$2)",[id,uid(2)]);
 await expect(asUser(db,2,'select audio_call_access($1)',[c.id])).rejects.toThrow(/member|Forbidden/i);
 expect((await db.query('select identity from audio_media_cleanup where room_name=$1 and identity=$2',['helios-'+c.id,c.participants.find(p=>p.user_id===uid(2))!.media_identity])).rows).toHaveLength(1);
 await finish(c.id);
});
it('uses a fresh media identity on rejoin and revokes every identity before deleting an ended room',async()=>{
 const {id}=await create('group');let c=await start(id);c=await act(c.id,'join',2);
 const previous=c.participants.find(p=>p.user_id===uid(2))!.media_identity;
 await act(c.id,'leave',2);c=await act(c.id,'join',2);
 expect(c.participants.find(p=>p.user_id===uid(2))!.media_identity).not.toBe(previous);
 await finish(c.id);
 const entries=(await db.query<{identity:string|null}>('select identity from audio_media_cleanup where room_name=$1',['helios-'+c.id])).rows;
 for(const p of c.participants)expect(entries.some(e=>e.identity===p.media_identity)).toBe(true);
 expect(entries.some(e=>e.identity===null)).toBe(true);
});
it('expires lost participants and ends abandoned calls without trusting client clocks',async()=>{
 const {id}=await create('group');const c=await start(id);
 await db.query("update audio_call_participants set heartbeat_at=now()-interval '2 minutes' where call_id=$1",[c.id]);
 const result=(await asUser(db,1,'select audio_call_list($1) c',[id])).rows[0] as {c:Call[]};
 expect(result.c.find(x=>x.id===c.id)?.state).toBe('ended');
});
it('revokes connected identities when a conversation is deleted for everyone',async()=>{
 const {id}=await create('group');const c=await start(id);await act(c.id,'join',2);
 await asUser(db,1,'select delete_conversation($1)',[id]);
 const rows=(await db.query<{identity:string}>('select identity from audio_media_cleanup where room_name=$1',['helios-'+c.id])).rows;
 for(const p of c.participants)expect(rows.some(r=>r.identity===p.media_identity)).toBe(true);
});
it('preserves one live call per conversation and scopes history to current membership',async()=>{
 const c=await start(conversation);expect((await start(conversation)).id).toBe(c.id);
 expect(((await asUser(db,3,'select audio_call_list(null) c')).rows[0] as {c:Call[]}).c).toEqual([]);
 await finish(c.id);
});
it('does not make an unaccepted group invitation block a direct call',async()=>{
 const group=await create('group');const ongoing=await start(group.id);
 const direct=(await asUser(db,3,"select create_conversation('direct',null,$1) id",[[uid(2)]])).rows[0] as {id:string};
 const attempt=await start(direct.id,3);expect(attempt.state).toBe('ringing');
 await act(attempt.id,'cancel',3);await finish(ongoing.id);
});
it('allows only service maintenance and permits one cleanup lease until released or expired',async()=>{
 await expect(asUser(db,1,'select audio_maintenance()')).rejects.toThrow(/permission denied/i);
 await expect(asUser(db,1,'select audio_cleanup_claim()')).rejects.toThrow(/permission denied/i);
 await db.exec('set role service_role');
 try{
  const lease=((await db.query('select audio_cleanup_claim() lease')).rows[0] as {lease:string}).lease;expect(lease).toMatch(/^[a-f0-9-]{36}$/);
  expect(((await db.query('select audio_cleanup_claim() lease')).rows[0] as {lease:null}).lease).toBeNull();
  await db.query('select audio_cleanup_release($1)',[lease]);
  expect(((await db.query('select audio_cleanup_claim() lease')).rows[0] as {lease:string}).lease).toBeTruthy();
  await db.exec("update audio_cleanup_lease set expires_at=now()-interval '1 second'");
 }finally{await db.exec('reset role');}
});
