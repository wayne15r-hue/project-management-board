import type { EmployeeIdentity, EmployeePerson } from './employee';
export type AccountStatus='active'|'deactivated'|'deleting'|'deleted';
export type AccountAction='reset_password'|'deactivate'|'reactivate'|'delete';
export type EmploymentType='Full-time'|'Part-time'|'Contract'|'Intern'|'Temporary'|'Other';
export interface DirectoryFields { employeeId:string|null; workLocation:string|null; joiningDate:string|null; employmentType:EmploymentType|null }
export interface AccountMetadata { status:AccountStatus; createdAt:string|null; lastSignInAt:string|null; emailVerified:boolean; revision:number; formerAdmin:boolean }
export interface AccountPerson extends EmployeePerson { account:AccountMetadata; directory:DirectoryFields; latestOperation?:AccountOperation|null }
export interface AccountFilters { q?:string; page?:number; department?:string; manager?:string; role?:string; status?:string; setup?:string }
export interface AccountDirectory { items:AccountPerson[]; total:number; page:number }
export interface AccountOperation { id:string; actor_id:string; target_id:string; action:AccountAction; status:'pending'|'running'|'succeeded'|'failed'|'ambiguous'; payload:Record<string,unknown>; attempts:number; last_error:string|null; created_at:string; updated_at:string; lease_token?:string }
export interface TransferRequirement { key:string; kind:'board'|'team'|'group'|'assignment'|'approval'|'manager'|'storage'; label:string; count:number; candidates:EmployeeIdentity[]; allowNone:boolean; blockedReason:string|null }
export interface DeletionPreview { userId:string; revision:number; status:AccountStatus; counts:Record<string,number>; requirements:TransferRequirement[]; blockers:string[]; confirmationEmail:string }
export interface AccountAuditEntry { id:string; actor:string; target:string; action:string; outcome:string; createdAt:string }
export interface AccountAuditPage { items:AccountAuditEntry[]; total:number; page:number }
