import {employeeMutation} from '@/lib/employee/server';
import {nameSchema} from '@/lib/profile/name';
import {z} from 'zod';
const setupSchema=nameSchema.extend({userId:z.uuid().optional()});
export const POST=(request:Request)=>employeeMutation(request,setupSchema,'profile_set_initial_name',value=>({p_first:value.firstName,p_last:value.lastName||null}),value=>value.userId);
