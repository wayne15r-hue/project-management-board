// Disposable native PostgreSQL: separate clients prove waiting writers recheck state.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync,spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const bin=process.env.PG_BIN??'C:/Program Files/PostgreSQL/17/bin';
const root=fs.mkdtempSync(path.resolve('../admin-qa/pg-leave-')),data=path.join(root,'data'),port='55449';
const run=(name,args,input)=>execFileSync(path.join(bin,`${name}.exe`),args,{input,encoding:'utf8',windowsHide:true,timeout:30000,...(name==='pg_ctl'?{stdio:'ignore'}:{})});
const args=['-X','-qAt','-h','127.0.0.1','-p',port,'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'];
const sql=s=>run('psql',args,s).trim(),uid=n=>`00000000-0000-4000-8000-00000000000${n}`;
const auth=n=>`set role authenticated;set request.jwt.claim.sub='${uid(n)}';`;
const sessions=[],passed=[];let seq=1,started=false;
const key=()=>`d0000000-0000-4000-8000-${String(seq++).padStart(12,'0')}`;
const json=v=>`'${JSON.stringify(v).replaceAll("'","''")}'::jsonb`;
function session(){const child=spawn(path.join(bin,'psql.exe'),args,{windowsHide:true});let output='',error='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>error+=b);sessions.push(child);const done=new Promise(resolve=>child.on('exit',code=>resolve({code,output,error})));return {done,send:s=>child.stdin.write(s+'\n'),wait:async marker=>{const deadline=Date.now()+15000;while(!output.includes(marker)){if(Date.now()>deadline)throw new Error('Session timeout '+output+error);await new Promise(r=>setTimeout(r,25));}}};}
async function race(aUser,aSql,bUser,bSql,expectError){const a=session(),b=session();a.send(auth(aUser)+`begin;${aSql}select 'FIRST_LOCKED';`);await a.wait('FIRST_LOCKED');b.send(auth(bUser)+`select 'SECOND_STARTED';${bSql}`);await b.wait('SECOND_STARTED');a.send('commit;\\q');assert.equal((await a.done).code,0);b.send('\\q');const result=await b.done;if(expectError){assert.notEqual(result.code,0);assert.match(result.error,expectError);}else assert.equal(result.code,0,result.error);return result;}
try{
 run('initdb',['-D',data,'-U','postgres','-A','trust','--no-locale','-E','UTF8']);run('pg_ctl',['-D',data,'-l',path.join(root,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port}`,'-w','start']);started=true;
 const fixture=fs.readFileSync('tests/database/fixture.ts','utf8');sql(fixture.match(/const setup = `([\s\S]*?)`;/)[1]);
 for(const f of fs.readdirSync('supabase/migrations').sort())sql(fs.readFileSync(`supabase/migrations/${f}`,'utf8'));
 sql(fixture.match(/if \(seed\) await db\.exec\(`([\s\S]*?)`\);/)[1]);
 sql(`insert into employee_admin_members(user_id,role) values('${uid(1)}','owner');insert into employee_records(user_id,department_id,job_title,manager_id,updated_by) select '${uid(2)}',id,'Agent','${uid(3)}','${uid(1)}' from employee_departments limit 1;`);
 const setting=(kind,payload)=>JSON.parse(sql(auth(1)+`select leave_settings('${kind}',${json(payload)},'${key()}');`));
 const type=setting('type',{name:'Concurrency annual'}).id;
 const policy=setting('policy',{name:'Concurrency policy',year_start:1,allowances:[{type_id:type,days:10,paid:true,tracked:true}]}).id;
 const cal=setting('calendar',{name:'Concurrency calendar',timezone:'Asia/Kolkata',weekdays:[1,2,3,4,5,6,7]}).id;
 setting('assignment',{user_id:uid(2),policy_id:policy,calendar_id:cal,opening_balances:[{type_id:type,period_start:'2027-01-01',days:10}],reason:'Isolated reviewed opening'});
 const submit=(start,end=start,k=key())=>`select leave_submit(${json({type_id:type,start_date:start,end_date:end,half:'full',reason:'Isolated fixture'})},'${k}');`;
 const action=(r,act,k=key())=>`select leave_action('${r.id}',${r.revision},'${act}','{"reason":"Fixture reviewed"}'::jsonb,'${k}');`;
 const reset=()=>sql(`truncate leave_operations,leave_notifications,leave_incident_history,leave_incident_records,leave_files,leave_history,leave_comments,leave_ledger,leave_days,leave_requests;insert into leave_ledger(user_id,type_id,period_start,kind,amount,actor_id,reason) values('${uid(2)}','${type}','2027-01-01','opening',10,'${uid(1)}','Reviewed opening');`);
 await race(2,submit('2027-01-01','2027-01-06'),2,submit('2027-01-07','2027-01-12'),/balance/i);assert.equal(sql(`select sum(amount) from leave_ledger where user_id='${uid(2)}';`),'4');passed.push('concurrent reservations reject overspending');reset();
 const retry=key(),payload=submit('2027-01-04','2027-01-04',retry);await race(2,payload,2,payload);assert.equal(sql('select count(*) from leave_requests;'),'1');assert.equal(sql("select count(*) from leave_ledger where kind='reservation';"),'1');passed.push('concurrent same-key submissions reserve once');reset();
 let r=JSON.parse(sql(auth(2)+submit('2027-01-04')));await race(3,action(r,'approve'),3,action(r,'decline'),/stale/i);assert.equal(sql("select count(*) from leave_ledger where kind='booking';"),'1');passed.push('concurrent opposing decisions reject stale revision');reset();
 r=JSON.parse(sql(auth(2)+submit('2027-01-04')));const decision=action(r,'approve');await race(3,decision,3,decision);assert.equal(sql("select count(*) from leave_ledger where kind='booking';"),'1');passed.push('concurrent repeated approval books once');reset();
 r=JSON.parse(sql(auth(2)+submit('2027-01-04')));const dep=sql(`select department_id from employee_records where user_id='${uid(2)}';`);
 await race(1,`select employee_admin_save('${uid(2)}','${dep}','Agent','${uid(1)}');`,3,action(r,'approve'),/access|reviewer/i);passed.push('waiting former manager loses decision access');
 sql(`update employee_records set manager_id='${uid(3)}' where user_id='${uid(2)}';`);reset();
 r=JSON.parse(sql(auth(2)+submit('2027-01-04')));const stale=session();stale.send(auth(3)+"begin isolation level repeatable read;select count(*) from leave_requests;select 'SNAPSHOT';");await stale.wait('SNAPSHOT');sql(auth(1)+`select employee_admin_save('${uid(2)}','${dep}','Agent','${uid(1)}');`);stale.send(action(r,'approve')+'commit;\\q');const result=await stale.done;assert.notEqual(result.code,0);assert.match(result.error,/serialize/i);passed.push('repeatable-read reviewer cannot use stale manager snapshot');
 const fingerprint=sql("select md5(string_agg(to_jsonb(c)::text,'|' order by id)) from cards c;");
 for(const f of fs.readdirSync('supabase/migrations').filter(f=>f.includes('leave')).sort())sql(fs.readFileSync(`supabase/migrations/${f}`,'utf8'));
 assert.equal(sql("select md5(string_agg(to_jsonb(c)::text,'|' order by id)) from cards c;"),fingerprint);assert.equal(sql('select count(*) from leave_requests;'),'1');passed.push('migration replay preserves work and leave history');
 fs.writeFileSync('../admin-qa/leave-concurrency-proof.json',JSON.stringify({passed,cluster:root,cardFingerprint:fingerprint},null,2));console.log(passed.map(v=>`PASS: ${v}`).join('\n'));
}finally{for(const child of sessions)if(child.exitCode===null)child.kill();if(started)run('pg_ctl',['-D',data,'-m','immediate','-w','stop']);}
