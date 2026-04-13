export type Priority = "low" | "medium" | "high";
export type FieldType = "text" | "number" | "date" | "select";
export type TeamRole = "owner" | "admin" | "member";
export type InviteStatus = "pending" | "accepted" | "expired";

export interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  email: string;
  created_at: string;
  updated_at: string;
}

export interface Board {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  created_at: string;
  updated_at: string;
  columns?: Column[];
}

export interface Column {
  id: string;
  board_id: string;
  name: string;
  position: number;
  color: string | null;
  created_at: string;
  cards?: Card[];
}

export interface Card {
  id: string;
  column_id: string;
  board_id: string;
  title: string;
  description: string | null;
  priority: Priority;
  position: number;
  due_date: string | null;
  start_date: string | null;
  assignee_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  assignee?: Profile | null;
  custom_field_values?: CustomFieldValue[];
}

export interface CustomFieldDefinition {
  id: string;
  board_id: string;
  name: string;
  field_type: FieldType;
  options: string[] | null;
  position: number;
  created_at: string;
}

export interface CustomFieldValue {
  id: string;
  card_id: string;
  field_id: string;
  value: unknown;
  field_definition?: CustomFieldDefinition;
}

export interface Team {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
  members?: TeamMember[];
}

export interface TeamMember {
  id: string;
  team_id: string;
  user_id: string;
  role: TeamRole;
  joined_at: string;
  profile?: Profile;
}

export interface Invite {
  id: string;
  team_id: string;
  email: string;
  invited_by: string;
  status: InviteStatus;
  token: string;
  created_at: string;
  expires_at: string;
}

export interface ActivityLog {
  id: string;
  card_id: string;
  actor_id: string;
  action: string;
  changes: Record<string, unknown> | null;
  created_at: string;
  actor?: Profile;
}

export interface BoardWithDetails extends Board {
  columns: (Column & { cards: Card[] })[];
}
