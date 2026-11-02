import { z } from "zod/v4";

const cardDate = z.union([z.iso.date(), z.iso.datetime({ offset: true })]).nullable().optional();

export const createCardSchema = z.object({
  columnId: z.string().uuid(),
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().max(5000).optional(),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  due_date: cardDate,
  start_date: cardDate,
  assignee_id: z.string().uuid().nullable().optional(),
});

export const updateCardSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  column_id: z.string().uuid().optional(),
  position: z.number().int().min(0).optional(),
  due_date: cardDate,
  start_date: cardDate,
  assignee_id: z.string().uuid().nullable().optional(),
  recurrence_rule: z.enum(["daily", "weekly", "biweekly", "monthly"]).nullable().optional(),
  cover_color: z.string().nullable().optional(),
  is_blocked: z.boolean().optional(),
  blocked_reason: z.string().trim().max(500).nullable().optional(),
}).refine((data) => data.is_blocked !== true || (typeof data.blocked_reason === "string" && data.blocked_reason.length > 0), {
  message: "A blocked reason is required", path: ["blocked_reason"],
});

export const moveCardSchema = z.object({
  column_id: z.string().uuid(),
  position: z.number().int().min(0),
});

export type CreateCardInput = z.infer<typeof createCardSchema>;
export type UpdateCardInput = z.infer<typeof updateCardSchema>;
