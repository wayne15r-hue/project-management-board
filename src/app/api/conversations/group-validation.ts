import { z } from 'zod';

export const groupName = z.string().trim().min(1, 'Group name is required.').max(100, 'Group name must be 100 characters or fewer.');
export const conversationCreation = z.object({
  type: z.enum(['direct', 'group']),
  userIds: z.array(z.uuid()).min(1).max(49),
  name: z.string().nullable().optional(),
});
export const groupMutation = z.discriminatedUnion('action', [
  z.object({ action: z.literal('rename'), name: groupName }).strict(),
  ...(['add', 'remove', 'promote', 'demote'] as const).map(action => z.object({ action: z.literal(action), userId: z.uuid() }).strict()),
  z.object({ action: z.literal('leave') }).strict(),
]);
export function groupErrorStatus(code?: string) {
  if (code === '42501') return 403;
  if (code === 'P0002') return 404;
  if (code === '23514') return 409;
  if (['22023', '22P02', '23503'].includes(code ?? '')) return 400;
  return 500;
}
