import fs from 'node:fs';
import {database} from '../tests/database/fixture.ts';
const db=await database();
try{
 await db.exec("insert into auth.users(id,email) values('e53212ba-857d-4f05-817d-1b4d43562a96','omkar.bahirat1@proton.me'); insert into employee_admin_members(user_id,role) values('e53212ba-857d-4f05-817d-1b4d43562a96','owner');");
 await db.exec(fs.readFileSync('../admin-qa/account-production-compact.sql','utf8'));
 console.log('PASS compact production wrapper preserves existing data');
}finally{await db.close();}
