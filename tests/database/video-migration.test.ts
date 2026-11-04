import {expect,it} from 'vitest';
import fs from 'node:fs';
import {database,asUser,conversation} from './fixture';

it('preserves historical call rows and participants across upgrade and repeat application',async()=>{
 const db=await database({policyOnly:true,beforeMigration:'20261104'});
 try{
  await asUser(db,1,'select audio_call_start($1)',[conversation]);
  const snapshot=async()=>({calls:(await db.query("select to_jsonb(c)-'initial_mode' row from audio_calls c order by id")).rows,participants:(await db.query('select * from audio_call_participants order by call_id,user_id')).rows});
  const before=await snapshot();
  const sql=fs.readFileSync('supabase/migrations/20261104_video_screen_sharing.sql','utf8');await db.exec(sql);
  expect(await snapshot()).toEqual(before);
  expect((await db.query('select initial_mode from audio_calls')).rows).toEqual([{initial_mode:'audio'}]);
  await db.exec(sql);expect(await snapshot()).toEqual(before);
  await expect(asUser(db,3,"select audio_call_start($1,true,'video')",[conversation])).rejects.toThrow(/member|Forbidden/i);
  await db.exec('set role anon');await expect(db.query("select audio_call_start($1,true,'video')",[conversation])).rejects.toThrow(/permission denied/i);await db.exec('reset role');
 }finally{await db.close();}
});
