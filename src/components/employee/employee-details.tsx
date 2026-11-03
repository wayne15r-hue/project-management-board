import type { EmployeeState } from '@/types/employee';
export function EmployeeDetails({state}:{state:EmployeeState}) {
  if(!state.record)return null;
  return <section className="mt-8 rounded-lg border p-5" aria-labelledby="employee-details-heading">
    <h2 id="employee-details-heading" className="font-semibold">Employee details</h2>
    <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
      <div><dt className="text-muted-foreground">Department</dt><dd>{state.departments.find(d=>d.id===state.record!.department_id)?.name??'Unavailable'}</dd></div>
      <div><dt className="text-muted-foreground">Job title</dt><dd>{state.record.job_title}</dd></div>
      <div><dt className="text-muted-foreground">Reporting to</dt><dd>{state.manager?.full_name??state.manager?.email??'No reporting manager'}</dd></div>
    </dl>
    <p className="mt-4 text-xs text-muted-foreground">Contact an admin to update these details.</p>
  </section>;
}
