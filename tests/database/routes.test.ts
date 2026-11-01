import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { asUser, board, card, column, database, team, uid } from "./fixture";

const mocks=vi.hoisted(()=>({createClient:vi.fn(),sendTeamInviteEmail:vi.fn()}));
vi.mock("@/lib/supabase/server",()=>({createClient:mocks.createClient}));
vi.mock("@/lib/email",()=>({sendTeamInviteEmail:mocks.sendTeamInviteEmail}));
import { POST as createTeam } from "@/app/api/teams/route";
import { POST as invite } from "@/app/api/teams/invite/route";
import { POST as accept } from "@/app/api/teams/invite/accept/route";
import { DELETE as deleteColumn } from "@/app/api/boards/[boardId]/columns/route";

const request=(body:unknown)=>new Request("http://localhost/api",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
describe("routes backed by actual database functions",()=>{
  let db:PGlite;
  let actingUser=1;
  beforeAll(async()=>{
    db=await database({policyOnly:true});
    mocks.createClient.mockImplementation(async()=>{
      const user=actingUser;
      return {
        auth:{getUser:async()=>({data:{user:{id:uid(user)}}})},
        rpc:(name:string,args:Record<string,unknown>)=>{
          const definitions:Record<string,[string,unknown[]]>={
            create_team:["select create_team($1) as data",[args.p_name]],
            invite_team_member:["select to_jsonb(invite_team_member($1::uuid,$2)) as data",[args.p_team_id,args.p_email]],
            accept_team_invite:["select accept_team_invite($1) as data",[args.p_token]],
            delete_board_column:["select delete_board_column($1::uuid,$2::uuid) as data",[args.p_board_id,args.p_column_id]],
          };
          const pending=(async()=>{
            try {
              const [sql,values]=definitions[name];
              const result=await asUser(db,user,sql,values);
              return {data:(result.rows[0] as {data:unknown}).data,error:null};
            }catch(error){return {data:null,error};}
          })();
          return Object.assign(pending,{single:()=>pending});
        },
        from:(table:string)=>({select:(fields:string)=>({eq:(key:string,value:unknown)=>({single:async()=>{
          if(!["teams","profiles"].includes(table)||key!=="id"||!["*","name","full_name"].includes(fields)) throw new Error("Unexpected test database query");
          try{return {data:(await asUser(db,user,`select ${fields} from public.${table} where id=$1`,[value])).rows[0],error:null};}
          catch(error){return {data:null,error};}
        }})})}),
      };
    });
    mocks.sendTeamInviteEmail.mockResolvedValue(undefined);
  },30000);
  afterAll(async()=>{await db?.close();});

  it("rejects unauthorized column deletion and rolls back an actual relocation failure",async()=>{
    actingUser=3;
    expect((await deleteColumn(request({columnId:column}),{params:Promise.resolve({boardId:board})})).status).toBe(403);
    await db.exec(`insert into columns(id,board_id,name,position) values ('20000000-0000-4000-8000-000000000003','${board}','Remaining',1);
      create function reject_route_move() returns trigger language plpgsql as $$begin raise exception 'relocation failed';end$$;
      create trigger reject_route_move before update on cards for each row execute function reject_route_move();`);
    actingUser=1;
    expect((await deleteColumn(request({columnId:column}),{params:Promise.resolve({boardId:board})})).status).toBe(500);
    expect((await db.query(`select id from columns where id='${column}'`)).rows).toHaveLength(1);
    expect((await db.query(`select id from cards where id='${card}'`)).rows).toHaveLength(1);
    await db.exec("drop trigger reject_route_move on cards");
    expect((await deleteColumn(request({columnId:column}),{params:Promise.resolve({boardId:board})})).status).toBe(200);
    expect((await db.query(`select column_id from cards where id='${card}'`)).rows).toEqual([{column_id:"20000000-0000-4000-8000-000000000003"}]);
  });
  it("creates a team with its initial owner through the HTTP handler",async()=>{
    actingUser=3;
    const response=await createTeam(request({name:"Route team"}));
    expect(response.status).toBe(201);
    const created=await response.json();
    expect((await asUser(db,3,"select role from team_members where team_id=$1",[created.id])).rows).toEqual([{role:"owner"}]);
  });
  it("reports delivery failure while preserving an actionable invite and atomic addressed acceptance",async()=>{
    actingUser=2;
    expect((await invite(request({teamId:team,email:"outsider@example.test"}))).status).toBe(403);
    actingUser=1;
    mocks.sendTeamInviteEmail.mockRejectedValueOnce(new Error("provider rejected message"));
    const response=await invite(request({teamId:team,email:"outsider@example.test"}));
    expect(response.status).toBe(201);
    const pending=await response.json();
    expect(pending).toMatchObject({email_sent:false,delivery_error:expect.any(String),token:expect.any(String)});
    actingUser=2;
    expect((await accept(request({token:pending.token}))).status).toBe(403);
    actingUser=3;
    expect((await accept(request({token:pending.token}))).status).toBe(200);
    expect((await accept(request({token:pending.token}))).status).toBe(200);
    expect((await db.query("select status from invites where token=$1",[pending.token])).rows).toEqual([{status:"accepted"}]);
  });
});
