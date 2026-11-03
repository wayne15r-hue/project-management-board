'use client';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { DirectoryFields, EmploymentType } from '@/types/accounts';

export const accountSelectClass='h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm';
export function DirectoryForm({initial,onSave}:{initial:DirectoryFields;onSave:(fields:DirectoryFields)=>Promise<void>}) {
  const id=useId();
  const [employeeId,setEmployeeId]=useState(initial.employeeId??'');
  const [workLocation,setWorkLocation]=useState(initial.workLocation??'');
  const [employmentType,setEmploymentType]=useState<EmploymentType|''>(initial.employmentType??'');
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  return <form className="space-y-4" onSubmit={async e=>{
    e.preventDefault();if(busy)return;
    const joiningDate=new FormData(e.currentTarget).get('joiningDate');
    setBusy(true);setError('');
    try{await onSave({employeeId:employeeId.trim()||null,workLocation:workLocation.trim()||null,joiningDate:typeof joiningDate==='string'&&joiningDate?joiningDate:null,employmentType:employmentType||null});}
    catch(e){setError(e instanceof Error?e.message:'Could not save directory fields');}finally{setBusy(false);}
  }}>
    <p className="text-sm text-muted-foreground">These optional fields are independent of the employee’s required initial setup. Saving them does not complete that setup.</p>
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2"><Label htmlFor={id+'-employee'}>Employee ID (optional)</Label><Input id={id+'-employee'} value={employeeId} maxLength={100} disabled={busy} onChange={e=>setEmployeeId(e.target.value)}/></div>
      <div className="space-y-2"><Label htmlFor={id+'-location'}>Work location (optional)</Label><Input id={id+'-location'} value={workLocation} maxLength={200} disabled={busy} onChange={e=>setWorkLocation(e.target.value)}/></div>
      <div className="space-y-2"><Label htmlFor={id+'-joining'}>Employment joining date (optional)</Label><Input id={id+'-joining'} name="joiningDate" type="date" defaultValue={initial.joiningDate??''} disabled={busy}/><p className="text-xs text-muted-foreground">Employment start date, separate from account creation.</p></div>
      <div className="space-y-2"><Label htmlFor={id+'-type'}>Employment type (optional)</Label><select id={id+'-type'} className={accountSelectClass} value={employmentType} disabled={busy} onChange={e=>setEmploymentType(e.target.value as EmploymentType|'')}><option value="">Not specified</option>{(['Full-time','Part-time','Contract','Intern','Temporary','Other'] as const).map(type=><option key={type}>{type}</option>)}</select></div>
    </div>
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
    <Button type="submit" disabled={busy}>{busy?'Saving…':'Save directory fields'}</Button>
  </form>;
}
