export type EmployeeAdminRole = 'owner' | 'admin' | null;
export interface Department { id:string; name:string; archived:boolean }
export interface EmployeeIdentity { id:string; full_name:string|null; email:string }
export interface EmployeeRecord { user_id:string; department_id:string; job_title:string; manager_id:string|null; completed_at:string; updated_at:string; updated_by:string }
export interface EmployeeState { userId:string; role:EmployeeAdminRole; record:EmployeeRecord|null; departments:Department[]; manager:EmployeeIdentity|null }
export interface EmployeePerson extends EmployeeIdentity { record:EmployeeRecord|null; department:string|null; manager:EmployeeIdentity|null; adminRole:EmployeeAdminRole }
export interface EmployeeDirectory { items:EmployeePerson[]; total:number; page:number }
