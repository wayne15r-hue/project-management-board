export const ticketTypes = ['it_issue', 'access_request', 'purchase_request', 'technical_request'] as const;
export const ticketStatuses = ['submitted', 'triage', 'in_progress', 'waiting', 'resolved', 'closed', 'cancelled'] as const;
export type TicketType = typeof ticketTypes[number];
export type TicketStatus = typeof ticketStatuses[number];
export type DeskView = 'mine' | 'queue' | 'reviews' | 'assigned';
export const typeLabels: Record<TicketType,string> = { it_issue:'IT issue', access_request:'Access request', purchase_request:'Tool / purchase approval', technical_request:'Technical request' };
export function deskLabel(value:string) { return value.replaceAll('_',' ').replace(/^./,c=>c.toUpperCase()); }
export function ticketReference(number:number) { return `SD-${String(number).padStart(6,'0')}`; }
export interface DeskMember { id:string; name:string; role:string; support:boolean }
export interface DeskTeam { id:string; name:string; admin:boolean; support:boolean; members:DeskMember[] }
export interface Ticket {
 id:string; number:number; team_id:string; requester_id:string; assignee_id:string|null; approver_id:string|null;
 title:string; description:string; type:TicketType; fields:Record<string,string>; priority:'low'|'medium'|'high';
 status:TicketStatus; waiting_reason:string|null; due_date:string|null; revision:number; work_started:boolean;
 approval_status:'not_requested'|'pending'|'approved'|'changes_requested'|'rejected'; resolution_note:string|null;
 created_at:string; updated_at:string;
}
export interface DeskList { items:Ticket[]; total:number; page:number; pageSize:number; counts:Record<DeskView,number> }
export interface DeskDetail {
 ticket:Ticket; team:DeskTeam;
 comments:{id:string;author_id:string;text:string;created_at:string}[];
 activity:{id:string;actor_id:string;action:string;details:Record<string,unknown>;created_at:string}[];
 approvals:{id:string;approver_id:string;revision:number;status:string;note:string|null;requested_at:string;decided_at:string|null}[];
 attachments:{id:string;file_name:string;file_size:number;created_at:string}[];
 links:{card_id:string;title:string;board_id:string}[];
}
