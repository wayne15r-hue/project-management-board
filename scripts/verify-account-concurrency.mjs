// Independent PostgreSQL connections; entirely disposable local data.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync,spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const bin=process.env.PG_BIN??'C:/Program Files/PostgreSQL/17/bin';
const root=fs.mkdtempSync(path.resolve('../admin-qa/pg-accounts-'));
const data=path.join(root,'data'),port='55449';
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

  const operation='90000000-0000-4000-8000-000000000001';
  const request=(id=operation)=>`select account_request_action('${uid(3)}','deactivate','${id}','{"expectedRevision":1}');`;
  const paused=session(), waiter=session();
  paused.send(auth(1)+`begin;select employee_set_admin('${uid(2)}',false);select 'REVOKED';`);
  await paused.wait('REVOKED');
  waiter.send(auth(2)+"select 'STARTED';"+request()); await waiter.wait('STARTED');
  paused.send('commit;\\q'); assert.equal((await paused.done).code,0);
  waiter.send('\\q'); const loser=await waiter.done;
  assert.notEqual(loser.code,0);assert.match(loser.error,/active admin required/i);
  assert.equal(sql("select count(*) from account_private.operations;"),'0');
  passed.push('revocation wins against a concurrent admin request');

  const first=session(), duplicate=session();
  first.send(auth(1)+'begin;'+request()+"select 'REQUESTED';"); await first.wait('REQUESTED');
  duplicate.send(auth(1)+"select 'STARTED';"+request()); await duplicate.wait('STARTED');
  first.send('commit;\\q'); assert.equal((await first.done).code,0);
  duplicate.send('\\q'); assert.equal((await duplicate.done).code,0);
  assert.equal(sql('select count(*) from account_private.operations;'),'1');
  passed.push('duplicate concurrent submission creates one operation');

  const worker=session(), rival=session();
  worker.send("begin;select account_claim_operations();select 'CLAIMED';"); await worker.wait('CLAIMED');
  rival.send("select 'STARTED';select account_claim_operations();"); await rival.wait('STARTED');
  worker.send('commit;\\q'); assert.equal((await worker.done).code,0);
  rival.send('\\q'); const other=await rival.done; assert.equal(other.code,0);assert.match(other.output,/\[\]/);
  passed.push('only one concurrent worker receives the provider lease');

  const oldLease=sql(`select lease_token from account_private.operations where id='${operation}';`);
  sql(`update account_private.operations set lease_until=now()-interval '1 second'; select account_claim_operations();`);
  assert.equal(sql(`select account_validate_operation('${operation}','${oldLease}');`),'f');
  const newLease=sql(`select lease_token from account_private.operations where id='${operation}';`);
  sql(`select account_finish_operation('${operation}','${oldLease}','succeeded',null);`);
  assert.equal(sql(`select status from account_private.operations where id='${operation}'`),'running');
  sql(`select account_finish_operation('${operation}','${newLease}','succeeded',null);`);
  passed.push('expired worker cannot finish or validate another lease');

  const del='90000000-0000-4000-8000-000000000002';
  sql(auth(1)+`select account_request_action('${uid(3)}','delete','${del}','{"expectedRevision":2,"confirmationEmail":"outsider@example.test","transfers":{}}');`);
  const lease=sql("select account_claim_operations()->0->>'lease_token'");
  sql(`select account_prepare_delete('${del}','${lease}');`);
  sql('create role qa_auth_admin;grant usage on schema auth to qa_auth_admin;grant select,delete on auth.users to qa_auth_admin;');
  sql(`set role qa_auth_admin;delete from auth.users where id='${uid(3)}';`);
  assert.equal(sql(`select status from account_private.accounts where id='${uid(3)}';`),'deleted');
  assert.equal(sql(`select status from account_private.operations where id='${del}';`),'succeeded');
  passed.push('limited Auth administrator can atomically finalize a prepared deletion');
  const fingerprint=sql("select md5(string_agg(to_jsonb(c)::text,'|' order by id)) from cards c;");
  sql(fs.readFileSync('supabase/migrations/20261103_z_account_management.sql','utf8'));
  assert.equal(sql("select md5(string_agg(to_jsonb(c)::text,'|' order by id)) from cards c;"),fingerprint);
  assert.equal(sql(`select count(*) from profiles where id='${uid(3)}' and auth_user_id is null;`),'1');
  passed.push('replay preserves shared work and does not reconnect a tombstone');
  console.log(passed.map(p=>'PASS '+p).join('\n'));
}finally{
  for(const child of sessions)if(child.exitCode===null)child.kill();
  if(started)run('pg_ctl',['-D',data,'-m','immediate','-w','stop']);
}
