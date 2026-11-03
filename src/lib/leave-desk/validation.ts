import { z } from 'zod/v4';
export const uuid=z.string().uuid();
export const isoDate=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v,'Choose a valid calendar date');
const reason=z.string().trim().min(1).max(5000);
const note=z.string().trim().max(5000).default('');
const requestFields=z.object({type_id:uuid,start_date:isoDate,end_date:isoDate,half:z.enum(['full','first','second']).default('full'),reason:note,past_explanation:note,handover:note,backup_id:uuid.nullable().optional()});
function validDates(v:{start_date:string;end_date:string;half:string}){return v.start_date<=v.end_date&&(v.half==='full'||v.start_date===v.end_date)&&Date.parse(v.end_date)-Date.parse(v.start_date)<=366*86400000;}
export const submitSchema=requestFields.extend({key:uuid}).refine(validDates,'Check the date range; half days must use a single date');
const actionName=z.enum(['approve','decline','changes','withdraw','resubmit','cancel','accept_cancel','reject_cancel','takeover','comment']);
export const actionSchema=z.object({revision:z.number().int().min(1),key:uuid,action:actionName,payload:z.object({type_id:uuid.optional(),start_date:isoDate.optional(),end_date:isoDate.optional(),half:z.enum(['full','first','second']).optional(),reason:z.string().trim().max(5000).optional(),past_explanation:z.string().trim().max(5000).optional(),handover:z.string().trim().max(5000).optional(),backup_id:uuid.nullable().optional()}).default({})}).superRefine((v,ctx)=>{
 if(['decline','changes','takeover','comment','reject_cancel'].includes(v.action)&&!v.payload.reason)ctx.addIssue({code:'custom',message:'A reason is required',path:['payload','reason']});
 const p=v.payload;if(p.start_date&&p.end_date&&!validDates({start_date:p.start_date,end_date:p.end_date,half:p.half??'full'}))ctx.addIssue({code:'custom',message:'Invalid date range'});
});
export const listSchema=z.object({view:z.enum(['mine','approvals']).default('mine')});
export const calendarSchema=z.object({start:isoDate,end:isoDate,department:uuid.optional()}).refine(v=>v.start<=v.end&&Date.parse(v.end)-Date.parse(v.start)<=92*86400000,'Choose up to 93 days');
export const balanceSchema=z.object({user:uuid.optional()});
const allowance=z.object({type_id:uuid,days:z.number().min(0).max(366),paid:z.boolean(),tracked:z.boolean()});
const opening=z.object({type_id:uuid,period_start:isoDate,days:z.number().min(0).max(10000)});
const holiday=z.object({id:uuid.optional(),calendar_id:uuid.nullable().optional(),date:isoDate,name:z.string().trim().min(1).max(200),kind:z.enum(['company','india_central','india_regional','india_restricted','us_federal']),source:z.string().max(2000).default(''),review_status:z.enum(['reviewed','unreviewed']).default('unreviewed')}).refine(v=>v.kind==='company'||/^https:\/\//.test(v.source),'Reference holidays require a source URL').refine(v=>v.kind!=='company'||!!v.calendar_id,'Company days off require a calendar');
export const settingsSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('type'),key:uuid,payload:z.object({id:uuid.optional(),name:z.string().trim().min(1).max(100),enabled:z.boolean().default(true)})}),
 z.object({kind:z.literal('policy'),key:uuid,payload:z.object({id:uuid.optional(),name:z.string().trim().min(1).max(100),year_start:z.union([z.literal(1),z.literal(4)]),allowances:z.array(allowance).min(1).max(100)})}),
 z.object({kind:z.literal('calendar'),key:uuid,payload:z.object({id:uuid.optional(),name:z.string().trim().min(1).max(100),timezone:z.string().min(1).max(100).refine(v=>{try{new Intl.DateTimeFormat('en',{timeZone:v});return true;}catch{return false;}},'Invalid timezone'),weekdays:z.array(z.number().int().min(1).max(7)).min(1).max(7).refine(v=>new Set(v).size===v.length,'Repeated working weekday')})}),
 z.object({kind:z.literal('assignment'),key:uuid,payload:z.object({user_id:uuid,policy_id:uuid,calendar_id:uuid,opening_balances:z.array(opening).max(100),reason})}),
 z.object({kind:z.literal('adjustment'),key:uuid,payload:z.object({user_id:uuid,type_id:uuid,period_start:isoDate,days:z.number().min(-10000).max(10000).refine(v=>v!==0),reason})}),
 z.object({kind:z.literal('holiday'),key:uuid,payload:holiday}),
 z.object({kind:z.literal('department'),key:uuid,payload:z.object({department_id:uuid,minimum_available:z.number().int().min(0).max(10000)})}),
]);
export const incidentSchema=z.object({key:uuid,payload:z.object({id:uuid.optional(),user_id:uuid.optional(),date:isoDate.optional(),expected_period:z.string().trim().min(1).max(200).optional(),action:z.enum(['record','explain','confirm','correct','dismiss','convert']),reason,request_id:uuid.optional(),revision:z.number().int().min(1).optional()}).superRefine((v,ctx)=>{
 if(v.action==='record'&&(!v.user_id||!v.date||!v.expected_period))ctx.addIssue({code:'custom',message:'Employee, date and expected work period are required'});
 if(v.action!=='record'&&(!v.id||!v.revision))ctx.addIssue({code:'custom',message:'Refresh the incident before updating'});
 if(v.action==='convert'&&!v.request_id)ctx.addIssue({code:'custom',message:'Select an approved leave request'});
})});
