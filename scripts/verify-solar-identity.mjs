// Disposable loopback PostgreSQL: independent connections, no production access.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync,spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const bin=process.env.PG_BIN??'C:/Program Files/PostgreSQL/17/bin';
const evidence=path.resolve('../output/helios-solar-implementation');fs.mkdirSync(evidence,{recursive:true});
const root=fs.mkdtempSync(path.join(evidence,'pg-')),data=path.join(root,'data'),port='55449';
const run=(name,args,input)=>execFileSync(path.join(bin,name+'.exe'),args,{input,encoding:'utf8',windowsHide:true,timeout:30000,...(name==='pg_ctl'?{stdio:'ignore'}:{})});
const args=['-X','-qAt','-h','127.0.0.1','-p',port,'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'];
const sql=s=>run('psql',args,s).trim();
const uid=n=>`00000000-0000-4000-8000-00000000000${n}`;
const auth=n=>`set role authenticated;set request.jwt.claim.sub='${uid(n)}';`;
const sessions=[];const passed=[];let started=false;
function session(){
 const child=spawn(path.join(bin,'psql.exe'),args,{windowsHide:true});child.stdin.on('error',()=>{});sessions.push(child);let output='',error='';
 child.stdout.on('data',value=>output+=value);child.stderr.on('data',value=>error+=value);
 return {done:new Promise(resolve=>child.on('exit',code=>resolve({code,output,error}))),send:value=>child.stdin.write(value+'\n'),wait:async marker=>{const end=Date.now()+15000;while(!output.includes(marker)){if(Date.now()>end)throw new Error(output+error);await new Promise(resolve=>setTimeout(resolve,25));}}};
}
try{
 run('initdb',['-D',data,'-U','postgres','-A','trust','--no-locale','-E','UTF8']);
 run('pg_ctl',['-D',data,'-l',path.join(root,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port}`,'-w','start']);started=true;
 const fixture=fs.readFileSync('tests/database/fixture.ts','utf8');sql(fixture.match(/const setup = `([\s\S]*?)`;/)[1]);
 const migration='20261104_solar_identity.sql';
 for(const file of fs.readdirSync('supabase/migrations').sort().filter(file=>file!==migration))sql(fs.readFileSync('supabase/migrations/'+file,'utf8'));
 sql(fixture.match(/if \(seed\) await db\.exec\(`([\s\S]*?)`\);/)[1]);
 sql(`insert into employee_admin_members(user_id,role) values('${uid(1)}','owner'),('${uid(2)}','admin');update profiles set full_name='  Legacy 名  ' where id='${uid(1)}';`);
 const tables=sql("select schemaname||'.'||tablename from pg_tables where schemaname in('public','auth','storage','account_private') order by 1;").split(/\r?\n/);
 const snapshot=()=>Object.fromEntries(tables.map(table=>[table,sql(`select coalesce(jsonb_agg(row order by row::text),'[]')::text from (select ${table==='public.profiles'?"to_jsonb(t)-'first_name'-'last_name'":"to_jsonb(t)"} row from ${table} t) q;`)]));
 const before=snapshot();const source=fs.readFileSync('supabase/migrations/'+migration,'utf8');sql(source);assert.deepEqual(snapshot(),before);sql(source);assert.deepEqual(snapshot(),before);passed.push(`upgrade and replay preserve rows in ${tables.length} existing tables`);
 const first=session(),second=session();first.send(auth(3)+"begin;select profile_set_initial_name('ओंकार',null);select 'INITIALIZED';");await first.wait('INITIALIZED');second.send(auth(3)+"select 'WAITING';select profile_set_initial_name('Overwrite',null);");await second.wait('WAITING');first.send('commit;\\q');assert.equal((await first.done).code,0);second.send('\\q');const loser=await second.done;assert.notEqual(loser.code,0);assert.match(loser.error,/already set/i);passed.push('concurrent first-name setup has exactly one winner');
 const revoke=session(),correction=session();revoke.send(auth(1)+`begin;select employee_set_admin('${uid(2)}',false);select 'REVOKED';`);await revoke.wait('REVOKED');correction.send(auth(2)+`select 'WAITING';select profile_admin_correct_name('${uid(3)}','Not allowed',null);`);await correction.wait('WAITING');revoke.send('commit;\\q');assert.equal((await revoke.done).code,0);correction.send('\\q');const denied=await correction.done;assert.notEqual(denied.code,0);assert.match(denied.error,/admin/i);passed.push('admin revocation wins against a waiting name correction');
 assert.equal(sql(`select full_name from profiles where id='${uid(1)}';`),'Legacy 名'); // psql trim only; exact preservation is in snapshot.
 sql(`grant update(full_name,first_name,last_name) on profiles to authenticated;`);
 let protectedWrite=false;try{sql(auth(3)+`update profiles set full_name='Direct bypass' where id='${uid(3)}';`);}catch(error){protectedWrite=/managed/i.test(String(error.stderr));}assert.ok(protectedWrite);passed.push('trigger rejects direct writes even if column grants are accidentally broadened');
 sql(`revoke update(full_name,first_name,last_name) on profiles from authenticated;`);
 // Compatibility rollback keeps additive columns/data and identity protections;
 // the previous client can still create an account with legacy full_name metadata.
 sql(`insert into auth.users(id,email,raw_user_meta_data) values('${uid(4)}','old-client@example.test','{"full_name":"Legacy client"}');`);
 assert.equal(sql(`select full_name from profiles where id='${uid(4)}';`),'Legacy client');passed.push('previous-client signup remains compatible with additive schema');
 fs.writeFileSync(path.join(evidence,'migration-concurrency-proof.json'),JSON.stringify({passed,tables:tables.length,cluster:root,productionAccess:false},null,2)+'\n');
 console.log(passed.map(value=>'PASS: '+value).join('\n'));
}finally{for(const child of sessions)if(child.exitCode===null)child.kill();if(started)run('pg_ctl',['-D',data,'-m','immediate','-w','stop']);}
