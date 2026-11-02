// Local, read-only review surface for transferring the verified migration to SQL Editor.
import http from 'node:http';
import fs from 'node:fs';
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
http.createServer((_req,res)=>{
 const migration=fs.readFileSync('supabase/migrations/20261102_z_service_desk.sql','utf8');
 res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
 res.end(`<html><head><title>Service Desk migration review</title></head><body><h1>Service Desk verified migration</h1><p>Read-only local source. Apply in the intended Supabase project after tests pass.</p><label>Migration SQL<textarea aria-label="Migration SQL" readonly style="width:98%;height:80vh">${escape(migration)}</textarea></label></body></html>`);
}).listen(4199,'127.0.0.1',()=>console.log('Read-only migration review: http://127.0.0.1:4199'));
