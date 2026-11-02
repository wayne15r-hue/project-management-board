export type ApprovalStatus = "not_requested" | "pending" | "changes_requested" | "approved";
export interface ApprovalReviewer {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}
export interface ApprovalRequest {
  id: string;
  card_id: string;
  revision: number;
  requester_id: string | null;
  reviewer_id: string | null;
  requester_name: string | null;
  reviewer_name: string | null;
  review_due_date: string;
  review_timezone: string;
  status: "pending" | "approved" | "changes_requested" | "withdrawn" | "superseded";
  decision_note: string | null;
  requested_at: string;
  decided_at: string | null;
}
export interface ApprovalHistoryEntry {
  id: string;
  action: string;
  note: string | null;
  created_at: string;
  actor_name: string | null;
}
export interface ApprovalDetails {
  required: boolean;
  reviewer_id: string | null;
  revision: number;
  status: ApprovalStatus;
  can_configure: boolean;
  can_request: boolean;
  can_withdraw: boolean;
  can_decide: boolean;
  current_request: ApprovalRequest | null;
  history: ApprovalHistoryEntry[];
  eligible_reviewers: ApprovalReviewer[];
  timezone: string;
  current_user_id: string;
}
type Operation = { operationId: string; expectedRevision: number };
export type ApprovalTransition = Operation & (
  | { action: "configure"; required: boolean; reviewerId: string | null; reason?: string }
  | { action: "request"; reviewDueDate: string }
  | { action: "approve" | "request_changes" | "withdraw"; requestId: string; note?: string }
);
