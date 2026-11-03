import type { EmployeeState } from '@/types/employee';
import type { DirectoryFields } from '@/types/accounts';
export function EmployeeDetails({state,directory,directoryUnavailable=false}:{state:EmployeeState;directory?:DirectoryFields|null;directoryUnavailable?:boolean}) {
  if(!state.record&&!directory&&!directoryUnavailable)return null;
  return <section className="mt-8 rounded-lg border p-5" aria-labelledby="employee-details-heading">
    <h2 id="employee-details-heading" className="font-semibold">Employee details</h2>
    {state.record&&<dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
      <div><dt className="text-muted-foreground">Department</dt><dd>{state.departments.find(d=>d.id===state.record!.department_id)?.name??'Unavailable'}</dd></div>
      <div><dt className="text-muted-foreground">Job title</dt><dd>{state.record.job_title}</dd></div>
      <div><dt className="text-muted-foreground">Reporting to</dt><dd>{state.manager?.full_name??state.manager?.email??'No reporting manager'}</dd></div>
    </dl>}
    {directory&&<dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">{[['Employee ID',directory.employeeId],['Work location',directory.workLocation],['Employment joining date',directory.joiningDate],['Employment type',directory.employmentType]].map(([label,value])=><div key={label}><dt className="text-muted-foreground">{label}</dt><dd>{value??'Not specified'}</dd></div>)}</dl>}
    {directoryUnavailable&&<p role="status" className="mt-4 text-sm text-muted-foreground">Optional directory fields are temporarily unavailable.</p>}
    <p className="mt-4 text-xs text-muted-foreground">Contact an admin to update these details.</p>
  </section>;
}
