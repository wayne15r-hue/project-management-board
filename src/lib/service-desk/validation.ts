import { z } from 'zod/v4';
import { ticketStatuses, ticketTypes } from '@/types/service-desk';
export const uuid = z.string().uuid();
const text = (max:number) => z.string().trim().min(1).max(max);
const priority = z.enum(['low','medium','high']);
const fields = z.record(z.string().max(50), z.string().max(5000));
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v,'Invalid calendar date');
const operation = z.object({operationId:uuid,expectedRevision:z.number().int().min(1)});
export const createTicketSchema = z.object({teamId:uuid,operationId:uuid,title:text(200),description:text(10000),type:z.enum(ticketTypes),priority,fields});
export const ticketActionSchema = z.discriminatedUnion('action',[
 operation.extend({action:z.literal('edit'),title:text(200).optional(),description:text(10000).optional(),fields:fields.optional()}),
 operation.extend({action:z.literal('assign'),assigneeId:uuid.nullable()}),
 operation.extend({action:z.literal('manage'),priority:priority.optional(),dueDate:date.nullable().optional()}),
 operation.extend({action:z.literal('status'),status:z.enum(ticketStatuses),note:text(5000).optional(),waitingReason:z.enum(['requester_information','approval']).optional()}),
 operation.extend({action:z.literal('request_approval'),approverId:uuid}),
 operation.extend({action:z.literal('approve'),note:text(5000).optional()}),
 operation.extend({action:z.literal('request_changes'),note:text(5000)}),
 operation.extend({action:z.literal('reject'),note:text(5000)}),
 operation.extend({action:z.literal('comment'),text:text(5000)}),
 operation.extend({action:z.literal('link'),cardId:uuid,remove:z.boolean().optional()}),
]);
export const listSchema = z.object({
 view:z.enum(['mine','queue','reviews','assigned']).default('mine'), team:uuid.optional(),
 search:z.string().trim().max(200).default(''),type:z.enum(ticketTypes).optional(),status:z.enum(ticketStatuses).optional(),
 priority:priority.optional(),assignee:uuid.optional(),page:z.coerce.number().int().min(1).max(100000).default(1),
});
