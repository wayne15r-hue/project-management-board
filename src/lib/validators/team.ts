import { z } from "zod/v4";

export const createTeamSchema = z.object({
  name: z.string().min(1, "Team name is required").max(100),
});

export const inviteSchema = z.object({
  teamId: z.string().uuid(),
  email: z.email("Valid email is required"),
});

export const acceptInviteSchema = z.object({
  token: z.string().min(1),
});

export type CreateTeamInput = z.infer<typeof createTeamSchema>;
export type InviteInput = z.infer<typeof inviteSchema>;
