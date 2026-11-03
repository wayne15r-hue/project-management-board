// Independent PostgreSQL connections; entirely disposable local data.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync,spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const bin=process.env.PG_BIN??'C:/Program Files/PostgreSQL/17/bin';
const root=fs.mkdtempSync(path.resolve('../admin-qa/pg-'));
const data=path.join(root,'data'),port='55446';
const run=(name,args,input)=>execFileSync(path.join(bin,name+'.exe'),args,{input,encoding:'utf8',windowsHide:true,timeout:30000,...(name==='pg_ctl'?{stdio:'ignore'}:{})});
const args=['-X','-qAt','-h','127.0.0.1','-p',port,'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'];
const sql=s=>run('psql',args,s).trim();
const uid=n=>`00000000-0000-4000-8000-00000000000${n}`;
const auth=n=>`set role authenticated;set request.jwt.claim.sub='${uid(n)}';`;
const sessions=[];
function session(){
  const child=spawn(path.join(bin,'psql.exe'),args,{windowsHide:true});let output='',error='';
  child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>error+=b);sessions.push(child);
  const done=new Promise(resolve=>child.on('exit',code=>resolve({code,output,error})));
  return {done,send:s=>child.stdin.write(s+'\n'),wait:async marker=>{
    const end=Date.now()+15000;
    while(!output.includes(marker)){if(Date.now()>end)throw new Error('Session timeout: '+output+error);await new Promise(r=>setTimeout(r,25));}
  }};
}
let started=false;
const passed=[];
try{
  run('initdb',['-D',data,'-U','postgres','-A','trust','--no-locale','-E','UTF8']);
  run('pg_ctl',['-D',data,'-l',path.join(root,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port}`,'-w','start']);started=true;
  const fixture=fs.readFileSync('tests/database/fixture.ts','utf8');
  sql(fixture.match(/const setup = `([\s\S]*?)`;/)[1]);
  for(const file of fs.readdirSync('supabase/migrations').sort())sql(fs.readFileSync('supabase/migrations/'+file,'utf8'));
  sql(fixture.match(/if \(seed\) await db\.exec\(`([\s\S]*?)`\);/)[1]);
  sql(`insert into employee_admin_members(user_id,role) values('${uid(1)}','owner'),('${uid(2)}','admin');`);
  const dep=sql("select id from employee_departments where name='IT';");
  const submit=(user,manager='null')=>`select employee_submit('${dep}','Engineer',${manager==='null'?'null':`'${uid(manager)}'`});`;
  async function race(firstUser,firstSql,secondUser,secondSql,expected){
    const a=session(),b=session();
    a.send(auth(firstUser)+'begin;'+firstSql+"select 'FIRST_LOCKED';");await a.wait('FIRST_LOCKED');
    b.send(auth(secondUser)+"select 'SECOND_STARTED';"+secondSql);await b.wait('SECOND_STARTED');
    a.send('commit;\\q');assert.equal((await a.done).code,0);b.send('\\q');const result=await b.done;
    assert.notEqual(result.code,0);assert.match(result.error,expected);
  }
  await race(2,submit(2),2,submit(2),/already completed/i);
  assert.equal(sql('select count(*) from employee_records;'),'1');passed.push('one concurrent first submission wins');
  sql('delete from employee_records;');
  await race(2,submit(2,3),3,submit(3,2),/cycle/i);passed.push('reciprocal reporting cycle rejected');
  sql('delete from employee_records;');
  const stale=session();stale.send(auth(3)+"begin isolation level repeatable read;select count(*) from employee_records;select 'SNAPSHOT';");await stale.wait('SNAPSHOT');
  sql(auth(2)+submit(2,3));stale.send(submit(3,2)+'commit;\\q');const staleResult=await stale.done;
  assert.notEqual(staleResult.code,0);assert.match(staleResult.error,/serialize/i);passed.push('stale repeatable-read graph writer aborts');
  sql('delete from employee_records;');
  await race(1,`select employee_save_department('${dep}','IT',true);`,3,submit(3),/department/i);passed.push('department archive rejects waiting new assignment');
  sql(`update employee_departments set archived=false where id='${dep}';`);
  await race(1,`select employee_set_admin('${uid(2)}',false);`,2,`select employee_admin_save('${uid(3)}','${dep}','Director',null);`,/admin required/i);passed.push('revocation rejects waiting admin write');
  const fingerprint=sql("select md5(string_agg(to_jsonb(c)::text,'|' order by id)) from cards c;");
  sql(fs.readFileSync('supabase/migrations/20261103_employee_admin.sql','utf8'));
  assert.equal(sql("select md5(string_agg(to_jsonb(c)::text,'|' order by id)) from cards c;"),fingerprint);
  passed.push('migration replay preserves work records');
  fs.writeFileSync('../admin-qa/concurrency-proof.json',JSON.stringify({passed,cardFingerprint:fingerprint,cluster:root},null,2));
  console.log(passed.map(p=>'PASS: '+p).join('\n'));
}finally{
  for(const child of sessions)if(child.exitCode===null)child.kill();
  if(started)run('pg_ctl',['-D',data,'-m','immediate','-w','stop']);
}
