import { afterAll, beforeAll, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { asUser, conversation, database, uid } from './fixture';
let db:PGlite;
let messageId:string;
beforeAll(async()=>{db=await database({policyOnly:true});messageId=(await db.query<{id:string}>('select id from messages where conversation_id=$1',[conversation])).rows[0].id;});
afterAll(async()=>{await db?.close();});
it('denies outsider reaction insertion even when the message UUID is known',async()=>{
  await expect(asUser(db,3,"insert into message_reactions(message_id,user_id,emoji) values($1,$2,'👀')",[messageId,uid(3)])).rejects.toThrow(/row-level security/);
});
it('allows a member to react but prevents other members deleting their reaction',async()=>{
  await asUser(db,2,"insert into message_reactions(message_id,user_id,emoji) values($1,$2,'👍')",[messageId,uid(2)]);
  expect((await asUser(db,1,'delete from message_reactions where message_id=$1 returning user_id',[messageId])).rows).toEqual([]);
  expect((await asUser(db,1,'select user_id from message_reactions where message_id=$1 and user_id=$2',[messageId,uid(2)])).rows).toHaveLength(1);
  expect((await asUser(db,2,'delete from message_reactions where message_id=$1 and user_id=$2 returning user_id',[messageId,uid(2)])).rows).toHaveLength(1);
});
it('authorizes typing presence by conversation membership and rejects malformed topics',async()=>{
  await db.query("select set_config('realtime.topic',$1,false)",[`typing:${conversation}`]);
  await asUser(db,2,"insert into realtime.messages(topic,extension) values($1,'presence')",[`typing:${conversation}`]);
  expect((await asUser(db,1,'select * from realtime.messages')).rows).toHaveLength(1);
  expect((await asUser(db,3,'select * from realtime.messages')).rows).toEqual([]);
  await expect(asUser(db,3,"insert into realtime.messages(topic,extension) values($1,'presence')",[`typing:${conversation}`])).rejects.toThrow(/row-level security/);
  await db.query("select set_config('realtime.topic','typing:not-a-uuid',false)");
  expect((await asUser(db,1,'select * from realtime.messages')).rows).toEqual([]);
});
it('marks only through the visible message and never moves read receipts backwards',async()=>{
  await db.query("update messages set created_at='2026-01-01T00:00:00Z' where id=$1",[messageId]);
  const second=(await db.query<{id:string}>("insert into messages(conversation_id,sender_id,content,created_at) values($1,$2,'Later unread message','2026-01-01T00:01:00Z') returning id",[conversation,uid(1)])).rows[0].id;
  await db.query('update conversation_members set last_read_at=null where conversation_id=$1 and user_id=$2',[conversation,uid(2)]);
  await asUser(db,2,'select mark_conversation_read($1,$2)',[conversation,messageId]);
  expect((await asUser(db,2,'select unread_count::int from conversation_summaries() where conversation_id=$1',[conversation])).rows).toEqual([{unread_count:1}]);
  await asUser(db,2,'select mark_conversation_read($1,$2)',[conversation,second]);
  await asUser(db,2,'select mark_conversation_read($1,$2)',[conversation,messageId]);
  expect((await asUser(db,2,'select unread_count::int from conversation_summaries() where conversation_id=$1',[conversation])).rows).toEqual([{unread_count:0}]);
  await expect(asUser(db,3,'select mark_conversation_read($1,$2)',[conversation,messageId])).rejects.toThrow(/Forbidden/);
});
