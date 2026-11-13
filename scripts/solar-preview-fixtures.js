// Fixture backend for the explicit local review server only. Not imported by src/.
export const user={id:'00000000-0000-4000-8000-000000000001',full_name:'Jordan Reed',email:'jordan@example.test',avatar_url:null};
const other={...user,id:'00000000-0000-4000-8000-000000000002',full_name:'Alex Taylor',email:'alex@example.test'};
export const fixture={incoming:false};
const now=new Date().toISOString();
export const boards=[{id:'10000000-0000-4000-8000-000000000001',name:'Operations',description:'Weekly work and decisions',owner_id:user.id,created_at:now,updated_at:now,color:'#9a5704',icon:null,cover_url:null}];
const favorites = new Set();
export const call={id:'call',conversation_id:'conversation',title:'Operations catch-up',kind:'group',caller_id:other.id,caller_name:other.full_name,state:'active',initialMode:'video',created_at:now,started_at:now,ended_at:null,end_reason:null,current_user_is_admin:true,participants:[user,other,{...other,id:'morgan',full_name:'Morgan Lee'},{...other,id:'sam',full_name:'Sam Kim'}].map((p,i)=>({user_id:p.id,media_identity:i===0?'local':p.id,display_name:p.full_name,state:'joined',blocked:false,heartbeat_at:now}))};
const conversation={id:'conversation',type:'group',name:'Operations team',created_by:user.id,created_at:now,updated_at:now,last_message_at:now,board_id:null,members:[user,other],last_message:{content:'Shall we walk through the handover?',message_type:'text',sender_id:other.id},unread_count:2,current_user_is_admin:true};
const messages=[{id:'message-1',conversation_id:'conversation',sender_id:other.id,content:'Morning! I’ve updated the weekly handover. Shall we walk through it together?',message_type:'text',file_url:null,file_name:null,file_size:null,file_type:null,reply_to_id:null,edited_at:null,created_at:now,sender:other,reactions:[]},{id:'message-2',conversation_id:'conversation',sender_id:user.id,content:'Thanks, Alex. I’ll check the open items before our catch-up.',message_type:'text',file_url:null,file_name:null,file_size:null,file_type:null,reply_to_id:null,edited_at:null,created_at:now,sender:user,reactions:[]}];
const role={userId:user.id,role:'owner',record:{user_id:user.id,department_id:'ops',job_title:'Operations manager',manager_id:null,completed_at:now,updated_at:now,updated_by:user.id},departments:[{id:'ops',name:'Operations',archived:false}],manager:null};
const person={...other,record:{...role.record,user_id:other.id,job_title:'Coordinator'},department:'Operations',manager:user,adminRole:null,account:{status:'active',createdAt:now,lastSignInAt:now,emailVerified:true,revision:1,formerAdmin:false},directory:{employeeId:'H-0042',workLocation:'Pune',joiningDate:'2026-01-01',employmentType:'Permanent'}};
const leaveContext={userId:user.id,admin:true,manager:true,employees:[{id:user.id,name:user.full_name,department_id:'ops'},{id:other.id,name:other.full_name,department_id:'ops'}],departments:[{id:'ops',name:'Operations'}],types:[{id:'annual',name:'Annual leave',enabled:true}],policies:[],calendars:[],assignment:null};
const balances=[{type_id:'annual',type_name:'Annual leave',period_start:'2026-01-01',allowance:28,adjustments:0,used:8,booked:3,pending:1,remaining:17}];
const team={id:'team',name:'Operations',support:true,admin:true,members:[{id:user.id,name:user.full_name,role:'owner',support:true},{id:other.id,name:other.full_name,role:'member',support:false}]};
const originalFetch=window.fetch.bind(window);
window.fetch=async(input,init)=>{
 const url=new URL(typeof input==='string'?input:input.url,location.origin);if(!url.pathname.startsWith('/api/'))return originalFetch(input,init);
 const method=init?.method||'GET';let value={};const body=init?.body?JSON.parse(init.body):{};
 if(url.pathname==='/api/calls'){
  if(method==='PATCH'){fixture.incoming=false;value={call:{...call,state:body.action==='join'?'active':'ended',participants:call.participants}};}
  else value={calls:fixture.incoming?[{...call,state:'ringing',initialMode:'audio',created_at:new Date().toISOString(),participants:call.participants.map(p=>({...p,state:p.user_id===user.id?'invited':'joined'}))}]:[],ready:true,groupReady:true,videoReady:true};
 }else if(url.pathname.includes('/token'))value={url:'local-preview',token:'fixture',capabilities:{video:true,screenShare:true}};
 else if(url.pathname==='/api/conversations')value=[conversation];
 else if(url.pathname.includes('/messages'))value=url.searchParams.has('after')?messages.filter(m=>m.created_at>url.searchParams.get('after')||(m.created_at===url.searchParams.get('after')&&m.id>url.searchParams.get('after_id'))):messages;
 else if(url.pathname.endsWith('/group'))value={name:conversation.name,members:[{...user,is_admin:true},{...other,is_admin:false}]};
 else if(url.pathname==='/api/employee/setup')value=role;
 else if(url.pathname.startsWith('/api/employee/managers'))value=[user];
 else if(url.pathname==='/api/admin/members')value=[{...user,role:'owner'}];
 else if(url.pathname.startsWith('/api/admin/employees')){if(method==='PATCH'){if(body.firstName)person.full_name=[body.firstName,body.lastName].filter(Boolean).join(' ');value={ok:true};}else value={items:[person],total:1,page:1};}
 else if(url.pathname.startsWith('/api/admin/audit'))value={items:[],total:0,page:1};
 else if(url.pathname.endsWith('/operations'))value=null;
 else if(url.pathname.startsWith('/api/my-work'))value={items:[{id:'task',title:'Review weekly handover',board_id:boards[0].id,column_id:'todo',priority:'high',due_date:now,is_blocked:false,board:boards[0],column:{id:'todo',name:'To do'},group:'today',is_due_today:true,is_overdue:false}],counts:{overdue:0,dueToday:1,blocked:0,totalOpen:1,pendingMyReview:0},total:1,page:1,pageSize:50,boards};
 else if(url.pathname==='/api/service-desk/teams')value={teams:[team]};
 else if(url.pathname.startsWith('/api/service-desk/tickets'))value={items:[],total:0,pageSize:25,counts:{mine:0,queue:0,reviews:0,assigned:0}};
 else if(url.pathname.startsWith('/api/leave-desk/')){const endpoint=url.pathname.split('/').at(-1);value=endpoint==='context'?leaveContext:endpoint==='balances'?balances:endpoint==='calendar'?{events:[],holidays:[],warnings:[]}:endpoint==='insights'?{balances,people_away:[],overlaps:[],pending_count:0,average_wait_days:0,monthly:[],unresolved_ncns:0}:[];}
 else if(url.pathname==='/api/boards/favorites'){
  if(method==='POST'){
   if(body.favorite)favorites.add(body.boardId);
   else favorites.delete(body.boardId);
  }
  value={boardIds:[...favorites]};
 }
 if(method!=='GET'&&!['/api/calls','/api/boards/favorites'].includes(url.pathname)&&!url.pathname.endsWith('/name')&&!url.pathname.includes('/token')&&!url.pathname.endsWith('/read'))return new Response(JSON.stringify({error:'This local review does not submit real work.'}),{status:503});
 return new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});
};
export function createClient(){
 const chain={select(){return chain;},eq(){return chain;},in(){return chain;},order(){return chain;},limit(){return chain;},update(){return chain;},insert(){return chain;},maybeSingle:async()=>({data:user,error:null}),single:async()=>({data:user,error:null}),then:resolve=>Promise.resolve({data:[],error:null}).then(resolve)};
 const channel={on(){return channel;},subscribe(callback){callback?.('SUBSCRIBED');return channel;},track:async()=>{},presenceState:()=>({}),unsubscribe:async()=>{}};
 return {auth:{getUser:async()=>({data:{user}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signInWithPassword:async()=>({error:{message:'This local preview does not authenticate accounts.'}}),signInWithOAuth:async()=>({error:{message:'OAuth is disabled in this local preview.'}}),signOut:async()=>{}},from:()=>chain,rpc:async()=>({data:[],error:null}),channel:()=>channel,removeChannel:()=>{},storage:{from:()=>({})}};
}
