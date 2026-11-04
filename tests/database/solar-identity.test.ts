import {beforeAll,afterAll,expect,it} from 'vitest';
import fs from 'node:fs';
import type {PGlite} from '@electric-sql/pglite';
import {database,asUser,uid} from './fixture';
let db:PGlite;
beforeAll(async()=>{db=await database();await db.exec(`insert into employee_admin_members(user_id,role) values('${uid(1)}','owner');`);});
afterAll(async()=>db?.close());
it('atomically initializes a single Unicode name and prevents a second setup or direct rename',async()=>{
 await asUser(db,2,'select profile_set_initial_name($1,$2)',['ओंकार','']);
 expect((await db.query('select full_name,first_name,last_name from profiles where id=$1',[uid(2)])).rows[0]).toEqual({full_name:'ओंकार',first_name:'ओंकार',last_name:null});
 await expect(asUser(db,2,'select profile_set_initial_name($1,$2)',['Different','Name'])).rejects.toThrow(/already/i);
 await expect(asUser(db,2,'update profiles set full_name=$1 where id=$2',['Bypass',uid(2)])).rejects.toThrow(/permission|managed/i);
 await expect(asUser(db,2,'update profiles set first_name=$1 where id=$2',['Bypass',uid(2)])).rejects.toThrow(/permission|managed/i);
});
it('requires central authority for audited corrections and refreshes the existing display-name column',async()=>{
 await expect(asUser(db,3,'select profile_admin_correct_name($1,$2,$3)',[uid(2),'Not','Allowed'])).rejects.toThrow(/admin/i);
 await asUser(db,1,'select profile_admin_correct_name($1,$2,$3)',[uid(2),'Alex','Taylor']);
 expect((await db.query('select full_name from profiles where id=$1',[uid(2)])).rows[0]).toEqual({full_name:'Alex Taylor'});
 expect((await db.query("select action from employee_change_log where subject_id=$1 and action='name_corrected'",[uid(2)])).rows).toHaveLength(1);
});
it('cannot rename by changing Auth metadata after initialization',async()=>{
 await db.query("update auth.users set raw_user_meta_data='{" + '"full_name":"Injected","first_name":"Injected"' + "}' where id=$1",[uid(2)]);
 expect((await db.query('select full_name from profiles where id=$1',[uid(2)])).rows[0]).toEqual({full_name:'Alex Taylor'});
});
it('derives new signup display names from structured metadata and rejects blank/control-character first names',async()=>{
 await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)',[uid(4),'new@example.test',{first_name:'  李  ',last_name:'小龙',full_name:'Ignored'}]);
 expect((await db.query('select first_name,last_name,full_name from profiles where id=$1',[uid(4)])).rows[0]).toEqual({first_name:'李',last_name:'小龙',full_name:'李 小龙'});
 await expect(asUser(db,3,'select profile_set_initial_name($1,$2)',['  ',''])).rejects.toThrow(/name/i);
 await expect(asUser(db,3,'select profile_set_initial_name($1,$2)',['bad\nname',''])).rejects.toThrow(/name/i);
});
it('preserves all pre-existing names and unrelated rows through upgrade and replay',async()=>{
 const legacy=await database({beforeMigration:'20261104_solar_identity.sql'});
 try{
 await legacy.query('update profiles set full_name=$1 where id=$2',['  Legacy  名  ',uid(2)]);
 const snapshot=async()=>({profiles:(await legacy.query("select to_jsonb(p)-'first_name'-'last_name' row from profiles p order by id")).rows,boards:(await legacy.query('select * from boards order by id')).rows,auth:(await legacy.query('select * from auth.users order by id')).rows});
 const before=await snapshot();const sql=fs.readFileSync('supabase/migrations/20261104_solar_identity.sql','utf8');
 await legacy.exec(sql);await legacy.exec(sql);expect(await snapshot()).toEqual(before);
 await expect(asUser(legacy,2,'select profile_set_initial_name($1,$2)',['Rewrite',''])).rejects.toThrow(/already/i);
 expect((await legacy.query('select first_name,last_name from profiles where id=$1',[uid(2)])).rows[0]).toEqual({first_name:null,last_name:null});
 }finally{await legacy.close();}
});
