// Disposable local PostgreSQL only; never reads production environment/credentials.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const bin=process.env.PG_BIN??'C:/Program Files/PostgreSQL/17/bin';
const root=fs.mkdtempSync(path.resolve('../admin-qa/pg-leave-release-'));
const data=path.join(root,'data'),port='55449';
const run=(name,args,input)=>execFileSync(path.join(bin,name+'.exe'),args,{input,encoding:'utf8',windowsHide:true,timeout:60000,...(name==='pg_ctl'?{stdio:'ignore'}:{})});
const args=['-X','-qAt','-h','127.0.0.1','-p',port,'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'];
const sql=s=>{try{return run('psql',args,s).trim();}catch(error){throw new Error(String(error.stderr??error.message));}};
let started=false;
const passed=[];
try{
 run('initdb',['-D',data,'-U','postgres','-A','trust','--no-locale','-E','UTF8']);
 run('pg_ctl',['-D',data,'-l',path.join(root,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port}`,'-w','start']);started=true;
 const fixture=fs.readFileSync('tests/database/fixture.ts','utf8');
 sql(fixture.match(/const setup = `([\s\S]*?)`;/)[1]);
 for(const file of fs.readdirSync('supabase/migrations').sort())if(!/^20261103_.*leave.*\.sql$/.test(file))sql(fs.readFileSync('supabase/migrations/'+file,'utf8'));
 sql(fixture.match(/if \(seed\) await db\.exec\(`([\s\S]*?)`\);/)[1]);
 const release=fs.readFileSync('../admin-qa/leave-production-release.sql','utf8');
 // The before/after fingerprint guard must actually fail and roll back on unrelated writes.
 const tampered=release.replace('do $preserve$',"update public.cards set title='MUST ROLL BACK';\ndo $preserve$");
 assert.throws(()=>sql(tampered),/Preservation failed for public.cards/);
 assert.equal(sql("select title from public.cards limit 1"),'Secret title');
 assert.equal(sql("select count(*) from storage.buckets where id='leave-files'"),'0');
 passed.push('preservation rejects unrelated mutation and rolls back migration/bucket');
 const result=sql(release);
 assert.match(result,/"preserved": true/);
 assert.equal(sql('select count(*) from public.leave_holidays where calendar_id is null'),'147');
 assert.equal(sql("select count(*) from public.leave_holidays where kind='company'"),'0');
 assert.equal(sql('select count(*) from public.leave_assignments'),'0');
 assert.equal(sql('select count(*) from public.leave_ledger'),'0');
 assert.equal(sql("select public from storage.buckets where id='leave-files'"),'f');
 passed.push('release preserves preexisting data and seeds reference overlays only');
 const reference=fs.readFileSync('supabase/migrations/20261103_zzz_leave_references.sql','utf8');
 sql(reference);assert.equal(sql('select count(*) from public.leave_holidays'),'147');
 passed.push('reference replay does not duplicate rows');
 assert.throws(()=>sql(release),/leave-files already exists/);
 passed.push('first-rollout wrapper refuses already provisioned bucket');
 fs.writeFileSync('../admin-qa/leave-release-proof.json',JSON.stringify({passed,cluster:root,productionWrites:false},null,2)+'\n');
 console.log(passed.map(p=>'PASS: '+p).join('\n'));
}finally{if(started)run('pg_ctl',['-D',data,'-m','immediate','-w','stop']);}
