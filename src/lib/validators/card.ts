import { z } from "zod/v4";

export const createCardSchema = z.object({
  columnId: z.string().uuid(),
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().max(5000).optional(),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  due_date: z.string().nullable().optional(),
  start_date: z.string().nullable().optional(),
  assignee_id: z.string().uuid().nullable().optional(),
});

export const updateCardSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  column_id: z.string().uuid().optional(),
  position: z.number().int().min(0).optional(),
  due_date: z.string().nullable().optional(),
  start_date: z.string().nullable().optional(),
  assignee_id: z.string().uuid().nullable().optional(),
  recurrence_rule: z.enum(["daily", "weekly", "biweekly", "monthly"]).nullable().optional(),
});

export const moveCardSchema = z.object({
  column_id: z.string().uuid(),
  position: z.number().int().min(0),
});

export type CreateCardInput = z.infer<typeof createCardSchema>;
export type UpdateCardInput = z.infer<typeof updateCardSchema>;
