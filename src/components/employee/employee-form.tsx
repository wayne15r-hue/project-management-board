'use client';
import { useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Department, EmployeeIdentity } from '@/types/employee';

export interface EmployeeValues { departmentId:string; jobTitle:string; managerId:string|null }
const selectClass='h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm';
export function EmployeeForm({userId,departments,initial,manager,onSave}: {
  userId:string; departments:Department[]; initial?:EmployeeValues; manager?:EmployeeIdentity|null;
  onSave:(value:EmployeeValues)=>Promise<void>;
}) {
  const id=useId();
  const [departmentId,setDepartment]=useState(initial?.departmentId??'');
  const [jobTitle,setTitle]=useState(initial?.jobTitle??'');
  const [managerId,setManager]=useState(initial?initial.managerId??'none':'');
  const [query,setQuery]=useState('');
  const [people,setPeople]=useState<EmployeeIdentity[]>([]);
  const [selected,setSelected]=useState<EmployeeIdentity|null>(manager??null);
  const [lookupError,setLookupError]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  useEffect(()=>{
    const controller=new AbortController();
    const timer=setTimeout(()=>{
      setLookupError('');
      fetch('/api/employee/managers?q='+encodeURIComponent(query),{signal:controller.signal})
        .then(async r=>{const data=await r.json();if(!r.ok)throw new Error(data.error??'Could not load managers');return data;})
        .then(setPeople).catch(e=>{if(!controller.signal.aborted)setLookupError(e.message);});
    },200);
    return()=>{clearTimeout(timer);controller.abort();};
  },[query]);
  const options=people.filter(p=>p.id!==userId);
  if(selected&&selected.id!==userId&&!options.some(p=>p.id===selected.id))options.unshift(selected);
  return <form className="space-y-4" onSubmit={async e=>{
    e.preventDefault();if(busy||!departmentId||!jobTitle.trim()||!managerId)return;
    setBusy(true);setError('');
    try{await onSave({departmentId,jobTitle:jobTitle.trim(),managerId:managerId==='none'?null:managerId});}
    catch(e){setError(e instanceof Error?e.message:'Could not save details. Please retry.');}
    finally{setBusy(false);}
  }}>
    <div className="space-y-2"><Label htmlFor={id+'-department'}>Department</Label>
      <select id={id+'-department'} className={selectClass} value={departmentId} required disabled={busy} onChange={e=>setDepartment(e.target.value)}>
        <option value="" disabled>Select your department</option>
        {departments.filter(d=>!d.archived||d.id===initial?.departmentId).map(d=><option key={d.id} value={d.id}>{d.name}{d.archived?' (archived)':''}</option>)}
      </select>
    </div>
    <div className="space-y-2"><Label htmlFor={id+'-title'}>Job title</Label><Input id={id+'-title'} required maxLength={200} value={jobTitle} disabled={busy} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Operations Manager"/></div>
    <div className="space-y-2"><Label htmlFor={id+'-search'}>Find reporting manager</Label><Input id={id+'-search'} value={query} maxLength={100} onChange={e=>setQuery(e.target.value)} placeholder="Search by name or email"/>
      {lookupError&&<p role="alert" className="text-sm text-destructive">{lookupError}</p>}
      <Label htmlFor={id+'-manager'}>Reporting to</Label>
      <select id={id+'-manager'} className={selectClass} required disabled={busy} value={managerId} onChange={e=>{setManager(e.target.value);setSelected(options.find(p=>p.id===e.target.value)??null);}}>
        <option value="" disabled>Select a manager or no reporting manager</option><option value="none">No reporting manager</option>
        {options.map(p=><option key={p.id} value={p.id}>{p.full_name??p.email} ({p.email})</option>)}
      </select>
      <p className="text-xs text-muted-foreground">Search to find users beyond the first 25 results.</p>
    </div>
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
    <Button type="submit" disabled={busy||!departmentId||!jobTitle.trim()||!managerId}>{busy?'Saving…':'Save employee details'}</Button>
  </form>;
}
