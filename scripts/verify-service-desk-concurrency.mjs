// Real PostgreSQL connections; isolated fixture cluster, never production.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync,spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const bin=process.env.POSTGRES_BIN||'C:/Program Files/PostgreSQL/17/bin';
const evidence=path.resolve('../service-desk-qa');fs.mkdirSync(evidence,{recursive:true});
const root=fs.mkdtempSync(path.join(evidence,'pg-'));const data=path.join(root,'data');const port='55444';
const run=(name,args,input)=>execFileSync(path.join(bin,name+'.exe'),args,{input,encoding:'utf8',windowsHide:true,timeout:30000,...(name==='pg_ctl'?{stdio:'ignore'}:{})});
const args=['-X','-qAt','-h','127.0.0.1','-p',port,'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'];
const sql=s=>run('psql',args,s).trim();const q=s=>"'"+String(s).replaceAll("'","''")+"'";
const uid=n=>`00000000-0000-4000-8000-00000000000${n}`;
const team='70000000-0000-4000-8000-000000000001';
const auth=n=>`set role authenticated; set request.jwt.claim.sub='${uid(n)}';`;
function session(){
 const child=spawn(path.join(bin,'psql.exe'),args,{windowsHide:true});let output='',error='';
 child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>error+=b);
 const done=new Promise(resolve=>child.on('exit',code=>resolve({code,output,error})));
 return {done,send:s=>child.stdin.write(s+'\n'),wait:async marker=>{const end=Date.now()+15000;while(!output.includes(marker)){if(Date.now()>end)throw new Error('Session timeout: '+output+error);await new Promise(r=>setTimeout(r,25));}}};
}
const create=(operationId=randomUUID())=>`select desk_create_ticket('${team}',${q(JSON.stringify({operationId,title:'Access fixture',description:'Isolated concurrency verification',type:'access_request',priority:'medium',fields:{system:'Git',access_level:'Write',reason:'QA'}}))}::jsonb);`;
const command=(id,action,payload={})=>`select desk_ticket_action('${id}',${q(action)},${q(JSON.stringify({operationId:randomUUID(),expectedRevision:1,...payload}))}::jsonb);`;
const action=(id,user,name,payload)=>JSON.parse(sql(auth(user)+command(id,name,payload)));
let started=false;
try{
 run('initdb',['-D',data,'-U','postgres','-A','trust','--no-locale','-E','UTF8']);
 run('pg_ctl',['-D',data,'-l',path.join(root,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port}`,'-w','start']);started=true;
 const fixture=fs.readFileSync('tests/database/fixture.ts','utf8');sql(fixture.match(/const setup = `([\s\S]*?)`;/)[1]);
 for(const file of fs.readdirSync('supabase/migrations').sort())sql(fs.readFileSync('supabase/migrations/'+file,'utf8'));
 sql(fixture.match(/if \(seed\) await db\.exec\(`([\s\S]*?)`\);/)[1]);
 sql(`insert into auth.users(id,email) values('${uid(4)}','reviewer@example.test');insert into team_members(team_id,user_id,role) values('${team}','${uid(4)}','member');`);
 const fingerprint=()=>sql("select md5(coalesce(string_agg(to_jsonb(c)::text,'' order by id),'')) from cards c;");
 const before=fingerprint();const migration=fs.readFileSync('supabase/migrations/20261102_z_service_desk.sql','utf8');
 const t=JSON.parse(sql(auth(2)+create()));action(t.id,1,'request_approval',{approverId:uid(4)});
 const edit=session(),decision=session();
 edit.send(`${auth(2)}begin;${command(t.id,'edit',{title:'Changed during review'})}select 'EDIT_LOCKED';`);await edit.wait('EDIT_LOCKED');
 decision.send(`${auth(4)}select 'DECISION_STARTED';${command(t.id,'approve')}`);await decision.wait('DECISION_STARTED');edit.send('commit;\\q');assert.equal((await edit.done).code,0);decision.send('\\q');
 const stale=await decision.done;assert.notEqual(stale.code,0);assert.match(stale.error,/revision/i);
 console.log('PASS: concurrent material edit rejects stale approval');
 action(t.id,1,'request_approval',{approverId:uid(4),expectedRevision:2});
 const approve=session(),reject=session();approve.send(`${auth(4)}begin;${command(t.id,'approve',{expectedRevision:2})}select 'APPROVAL_LOCKED';`);await approve.wait('APPROVAL_LOCKED');
 reject.send(`${auth(4)}select 'REJECTION_STARTED';${command(t.id,'reject',{expectedRevision:2,note:'Conflicting decision'})}`);await reject.wait('REJECTION_STARTED');approve.send('commit;\\q');assert.equal((await approve.done).code,0);reject.send('\\q');assert.notEqual((await reject.done).code,0);
 assert.equal(sql(`select approval_status from desk_tickets where id='${t.id}'`),'approved');console.log('PASS: conflicting reviewer decisions commit exactly one outcome');
 const op=randomUUID(),a=session(),b=session();a.send(`${auth(2)}begin;${create(op)}select 'CREATE_LOCKED';`);await a.wait('CREATE_LOCKED');
 b.send(`${auth(2)}select 'RETRY_STARTED';${create(op)}`);await b.wait('RETRY_STARTED');a.send('commit;\\q');assert.equal((await a.done).code,0);b.send('\\q');assert.equal((await b.done).code,0);
 assert.equal(sql(`select count(*) from desk_operations where operation_id='${op}'`),'1');console.log('PASS: concurrent submission retries produce one ticket');
 const removal=session(),comment=session();removal.send(`begin;delete from team_members where team_id='${team}' and user_id='${uid(2)}';select 'REMOVAL_LOCKED';`);await removal.wait('REMOVAL_LOCKED');
 comment.send(`${auth(2)}select 'COMMENT_STARTED';${command(t.id,'comment',{expectedRevision:2,text:'Must not commit after removal'})}`);await comment.wait('COMMENT_STARTED');removal.send('commit;\\q');assert.equal((await removal.done).code,0);comment.send('\\q');assert.notEqual((await comment.done).code,0);
 assert.equal(sql("select count(*) from desk_comments where text='Must not commit after removal'"),'0');console.log('PASS: concurrent membership removal blocks late ticket mutation');
 const snapshot=sql('select jsonb_agg(to_jsonb(t) order by id) from desk_tickets t');sql(migration);sql(migration);assert.equal(sql('select jsonb_agg(to_jsonb(t) order by id) from desk_tickets t'),snapshot);
 try{sql(migration.replace(/commit;\s*$/i,'alter table cards add column desk_rollback_probe integer;select 1/0;commit;'));assert.fail('Injected failure should abort');}catch(e){assert.match(String(e),/division by zero/);}
 assert.equal(sql("select count(*) from information_schema.columns where table_name='cards' and column_name='desk_rollback_probe'"),'0');assert.equal(fingerprint(),before);
 console.log('PASS: replay, injected rollback and original-card fingerprint preservation');
 fs.writeFileSync(path.join(evidence,'concurrency-proof.json'),JSON.stringify({passed:true,originalCardsFingerprint:before,cluster:root},null,2));
}finally{if(started)run('pg_ctl',['-D',data,'-m','immediate','-w','stop']);}
