import { z } from 'zod';
export const operationInput=z.object({operationId:z.string().uuid()}).strict();
export const statusInput=operationInput.extend({action:z.enum(['deactivate','reactivate']),expectedRevision:z.number().int().positive()});
export const deletionInput=operationInput.extend({expectedRevision:z.number().int().positive(),confirmationEmail:z.string().email().max(320),transfers:z.record(z.string().max(200),z.string().uuid().nullable())});
const optionalText=(max:number)=>z.string().trim().min(1).max(max).nullable();
export const directoryInput=z.object({employeeId:optionalText(100),workLocation:optionalText(200),joiningDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),employmentType:z.enum(['Full-time','Part-time','Contract','Intern','Temporary','Other']).nullable()}).strict();
