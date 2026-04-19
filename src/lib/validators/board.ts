import { z } from "zod/v4";

export const createBoardSchema = z.object({
  name: z.string().min(1, "Board name is required").max(100),
  description: z.string().max(500).optional(),
});

export const updateBoardSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  background_theme: z
    .enum(["default", "gradient-blue", "gradient-purple", "gradient-green", "dark"])
    .nullable()
    .optional(),
});

export const createColumnSchema = z.object({
  name: z.string().min(1, "Column name is required").max(50),
  color: z.string().optional(),
});

export const updateColumnsSchema = z.object({
  columns: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(50).optional(),
      position: z.number().int().min(0).optional(),
      color: z.string().nullable().optional(),
    })
  ),
});

export const deleteColumnSchema = z.object({
  columnId: z.string().uuid(),
});

export type CreateBoardInput = z.infer<typeof createBoardSchema>;
export type UpdateBoardInput = z.infer<typeof updateBoardSchema>;
export type CreateColumnInput = z.infer<typeof createColumnSchema>;
export type UpdateColumnsInput = z.infer<typeof updateColumnsSchema>;
