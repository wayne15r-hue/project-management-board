import {z} from 'zod';
const component=z.string().refine(value=>!/[\u0000-\u001f\u007f-\u009f]/u.test(value),'Names cannot contain control characters').transform(value=>value.trim());
export const nameSchema=z.object({
 firstName:component.pipe(z.string().min(1).max(100)),
 lastName:component.pipe(z.string().max(100)).optional(),
});
export type NameInput=z.infer<typeof nameSchema>;
export function displayName(value:NameInput){return [value.firstName,value.lastName].filter(Boolean).join(' ');}
