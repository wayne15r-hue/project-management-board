import { z } from 'zod';
export const employeeInput = z.object({
  departmentId:z.string().uuid(), jobTitle:z.string().trim().min(1).max(200), managerId:z.string().uuid().nullable(),
}).strict();
export const adminEmployeeInput = employeeInput.extend({userId:z.string().uuid()});
export const employeeSetupInput = employeeInput.extend({userId:z.string().uuid()});
export const departmentInput = z.object({id:z.string().uuid().nullable(),name:z.string().trim().min(1).max(100),archived:z.boolean()}).strict();
export const adminInput = z.object({userId:z.string().uuid(),enabled:z.boolean()}).strict();
