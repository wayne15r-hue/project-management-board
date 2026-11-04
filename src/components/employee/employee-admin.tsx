'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmployeeForm } from './employee-form';
import { DirectoryForm, accountSelectClass } from './directory-form';
import { AccountControls, accountDate } from './account-controls';
import { NameForm } from '@/components/profile/name-form';
import { useRouter } from 'next/navigation';
import { AccountAudit } from './account-audit';
import type { Department, EmployeeIdentity, EmployeeState } from '@/types/employee';
import type { AccountDirectory, AccountPerson } from '@/types/accounts';

async function read<T>(url:string):Promise<T> {
  const r=await fetch(url,{cache:'no-store'});const data=await r.json();
  if(!r.ok)throw new Error(data.error??'Unable to load administration');return data;
}
export function EmployeeAdmin() {
  const cache=useQueryClient();
  const router=useRouter();
  const [nameEditing,setNameEditing]=useState<AccountPerson|null>(null);
  const [tab,setTab]=useState<'people'|'departments'|'admins'|'audit'>('people');
  const [query,setQuery]=useState('');const [page,setPage]=useState(1);
  const [filters,setFilters]=useState({department:'',manager:'',role:'',status:'',setup:''});
  const [managerSearch,setManagerSearch]=useState('');
  const [filterManager,setFilterManager]=useState<EmployeeIdentity|null>(null);
  const [editing,setEditing]=useState<AccountPerson|null>(null);
  const [directoryEditing,setDirectoryEditing]=useState<AccountPerson|null>(null);
  const [error,setError]=useState('');const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
  const state=useQuery({queryKey:['employee-admin','state'],queryFn:()=>read<EmployeeState>('/api/employee/setup')});
  const directory=useQuery({queryKey:['employee-admin','directory',query,page,filters],queryFn:()=>read<AccountDirectory>(`/api/admin/employees?${new URLSearchParams({q:query,page:String(page),...filters})}`),enabled:!!state.data?.role&&tab==='people'});
  const managers=useQuery({queryKey:['employee-admin','manager-options',managerSearch],queryFn:()=>read<EmployeeIdentity[]>(`/api/employee/managers?q=${encodeURIComponent(managerSearch)}`),enabled:!!state.data?.role&&tab==='people'});
  const members=useQuery({queryKey:['employee-admin','members'],queryFn:()=>read<(EmployeeIdentity&{role:'owner'|'admin'})[]>('/api/admin/members')});
  async function mutate(url:string,method:string,value:unknown) {
    const r=await fetch(url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
    const data=await r.json();if(!r.ok)throw new Error(data.error??'Could not save changes');
    await cache.invalidateQueries();
    router.refresh();
    setMessage('Changes saved.');
  }
  async function changeAdmin(userId:string,enabled:boolean) {
    setBusy(true);setError('');setMessage('');
    try{await mutate('/api/admin/members','POST',{userId,enabled});}
    catch(e){setError(e instanceof Error?e.message:'Could not update admin access');}
    finally{setBusy(false);}
  }
  if(state.isPending)return <p className="p-6">Loading administration…</p>;
  if(state.error)return <p role="alert" className="p-6">{state.error.message}</p>;
  if(!state.data?.role)return <p role="alert" className="p-6">Admin access is required. Contact the Admin Team owner.</p>;
  const owner=state.data.role==='owner';
  return <div className="mx-auto w-full max-w-5xl space-y-6 px-5 py-10 md:px-10">
    <div><h1 className="text-2xl font-semibold">Admin</h1><p className="mt-1 text-sm text-muted-foreground">Manage accounts, employee details, departments, and the Admin Team.</p></div>
    <div className="flex flex-wrap gap-2" aria-label="Administration sections">
      {(['people','departments','admins','audit'] as const).map(value=><Button key={value} variant={tab===value?'default':'outline'} aria-pressed={tab===value} onClick={()=>{setTab(value);setEditing(null);setDirectoryEditing(null);setMessage('');setError('');}}>{value==='people'?'People':value==='departments'?'Departments':value==='audit'?'Audit log':'Admin Team'}</Button>)}
    </div>
    {message&&<p role="status" className="text-sm">{message}</p>}
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
    {nameEditing&&<section aria-label="Correct employee name" className="space-y-4 rounded-xl border bg-card p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">Correct name</h2><Button variant="ghost" onClick={()=>setNameEditing(null)}>Cancel name correction</Button></div><p className="break-words text-sm">Current name: {nameEditing.full_name??'Not set'} · {nameEditing.email}</p><p className="text-sm text-muted-foreground">Enter the corrected first name and optional surname. This correction is recorded in the audit log.</p><NameForm key={nameEditing.id} submitLabel="Save corrected name" onSave={async value=>{await mutate(`/api/admin/employees/${nameEditing.id}/name`,'PATCH',value);setNameEditing(null);}}/></section>}
    {tab==='audit'?<AccountAudit/>:tab==='departments'?<div className="space-y-4">
      <DepartmentEditor key="new" onSave={async name=>{await mutate('/api/admin/departments','POST',{id:null,name,archived:false});}}/>
      {state.data.departments.map(d=><DepartmentEditor key={d.id+':'+d.name+':'+d.archived} department={d} onSave={async(name,archived)=>{await mutate('/api/admin/departments','POST',{id:d.id,name,archived:archived??d.archived});}}/>)}
    </div>:tab==='admins'?<div className="space-y-5">
      <p className="text-sm text-muted-foreground">{owner?'You own the Admin Team. Use People to grant admin access to an existing user.':'The owner grants and revokes admin access. Admins can manage employee details and departments.'}</p>
      {members.error&&<p role="alert">{members.error.message}</p>}
      {members.data?.map(m=><div key={m.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
        <div className="min-w-0 break-words"><p className="font-medium">{m.full_name??m.email}</p><p className="text-sm text-muted-foreground break-all">{m.email} · {m.role==='owner'?'Owner':'Admin'}</p></div>
        {owner&&m.role!=='owner'&&<Button variant="outline" disabled={busy} onClick={()=>void changeAdmin(m.id,false)}>Remove admin access</Button>}
      </div>)}
    </div>:<>
      <div className="space-y-2"><Label htmlFor="employee-user-search">Search people</Label><Input id="employee-user-search" placeholder="Name or email" maxLength={100} value={query} onChange={e=>{setQuery(e.target.value);setPage(1);setEditing(null);setDirectoryEditing(null);}}/></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(['department','role','status','setup'] as const).map(key=><div className="space-y-2" key={key}><Label htmlFor={'filter-'+key}>{key[0].toUpperCase()+key.slice(1)} filter</Label><select id={'filter-'+key} className={accountSelectClass} value={filters[key]} onChange={e=>{setFilters({...filters,[key]:e.target.value});setPage(1);setEditing(null);setDirectoryEditing(null);}}><option value="">All</option>
          {key==='department'?state.data.departments.map(d=><option key={d.id} value={d.id}>{d.name}{d.archived?' (archived)':''}</option>):(key==='role'?[['employee','Ordinary user'],['admin','Admin'],['owner','Owner']]:key==='status'?[['active','Active'],['deactivated','Deactivated'],['deleting','Deleting'],['deleted','Deleted']]:[['complete','Setup complete'],['incomplete','Setup incomplete']]).map(([value,label])=><option key={value} value={value}>{label}</option>)}
        </select></div>)}
        <div className="space-y-2"><Label htmlFor="filter-manager-search">Find a manager to filter</Label><Input id="filter-manager-search" placeholder="Name or email" maxLength={100} value={managerSearch} onChange={e=>setManagerSearch(e.target.value)}/><Label htmlFor="filter-manager">Manager filter</Label><select id="filter-manager" className={accountSelectClass} value={filters.manager} onChange={e=>{setFilters({...filters,manager:e.target.value});setFilterManager(managers.data?.find(m=>m.id===e.target.value)??null);setPage(1);setEditing(null);setDirectoryEditing(null);}}><option value="">All reporting managers</option>{filterManager&&!managers.data?.some(m=>m.id===filterManager.id)&&<option value={filterManager.id}>{filterManager.full_name??filterManager.email} ({filterManager.email})</option>}{managers.data?.map(m=><option key={m.id} value={m.id}>{m.full_name??m.email} ({m.email})</option>)}</select>{managers.error&&<p role="alert" className="text-sm text-destructive">{managers.error.message}</p>}</div>
        <div className="flex items-end"><Button variant="outline" disabled={directory.isFetching} onClick={()=>void directory.refetch()}>Refresh people</Button></div>
      </div>
      {directory.isPending&&<p>Loading people…</p>}
      {directory.error&&<p role="alert">{directory.error.message}</p>}
      {directoryEditing?<section className="space-y-5 rounded-lg border p-5" aria-label="Edit optional directory fields"><div className="flex flex-wrap justify-between gap-3"><div><h2 className="font-semibold">Edit directory</h2><p className="text-sm break-all">{directoryEditing.full_name??directoryEditing.email} · {directoryEditing.email}</p></div><Button variant="ghost" onClick={()=>setDirectoryEditing(null)}>Cancel</Button></div><DirectoryForm key={directoryEditing.id} initial={directoryEditing.directory} onSave={async fields=>{await mutate(`/api/admin/employees/${directoryEditing.id}/directory`,'PATCH',fields);setDirectoryEditing(null);}}/></section>:editing?<section className="space-y-5 rounded-lg border p-5">
        <div className="flex flex-wrap justify-between gap-3"><div className="min-w-0"><h2 className="font-semibold">Edit employee details</h2><p className="text-sm break-all">{editing.full_name??editing.email} · {editing.email}</p></div><Button variant="ghost" onClick={()=>setEditing(null)}>Cancel</Button></div>
        <EmployeeForm key={editing.id} userId={editing.id} departments={state.data.departments} manager={editing.manager}
          initial={editing.record?{departmentId:editing.record.department_id,jobTitle:editing.record.job_title,managerId:editing.record.manager_id}:undefined}
          onSave={async value=>{await mutate('/api/admin/employees','PATCH',{userId:editing.id,...value});setEditing(null);}}/>
      </section>:<div className="space-y-3">
        {directory.data?.items.map(person=><article key={person.id} className="flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4" aria-label={'Account '+(person.full_name??person.email)}>
          <div className="min-w-0 flex-1 basis-52"><p className="font-medium break-words">{person.full_name??person.email}{person.adminRole&&<span className="ml-2 text-xs text-muted-foreground">{person.adminRole==='owner'?'Owner':'Admin'}</span>}</p><p className="text-sm text-muted-foreground break-all">{person.email}</p>
            {person.record?<div className="mt-2 space-y-1 text-sm break-words"><p>{person.department} · {person.record.job_title}</p><p className="text-muted-foreground">Reports to: {person.manager?.full_name??person.manager?.email??'No reporting manager'}</p></div>:<p className="mt-2 text-sm text-muted-foreground">Setup incomplete</p>}
            <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2"><div><dt className="text-muted-foreground">Account status</dt><dd className="capitalize">{person.account.status}</dd></div><div><dt className="text-muted-foreground">Email verification</dt><dd>{person.account.emailVerified?'Email verified':'Email unverified'}</dd></div><div><dt className="text-muted-foreground">Account created</dt><dd>{accountDate(person.account.createdAt)}</dd></div><div><dt className="text-muted-foreground">Last sign-in</dt><dd>{person.account.lastSignInAt?accountDate(person.account.lastSignInAt):'Never signed in'}</dd></div></dl>
            <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">{[['Employee ID',person.directory.employeeId],['Work location',person.directory.workLocation],['Employment joining date',person.directory.joiningDate],['Employment type',person.directory.employmentType]].map(([label,value])=><div key={label}><dt className="text-muted-foreground">{label}</dt><dd>{value??'Not specified'}</dd></div>)}</dl>
          </div>
          <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={person.account.status==='deleted'||person.account.status==='deleting'} onClick={()=>{setNameEditing(person);setEditing(null);setDirectoryEditing(null);}}>Correct name</Button><Button variant="outline" disabled={!person.record||person.account.status==='deleted'} onClick={()=>{setEditing(person);setDirectoryEditing(null);setMessage('');}}>Edit details</Button><Button variant="outline" disabled={person.account.status==='deleted'} onClick={()=>{setDirectoryEditing(person);setEditing(null);setMessage('');}}>Edit directory</Button>
            {owner&&person.adminRole!=='owner'&&person.account.status==='active'&&<Button variant="outline" disabled={busy} onClick={()=>void changeAdmin(person.id,!person.adminRole)}>{person.adminRole?'Remove admin access':'Grant admin access'}</Button>}
          </div>
          <AccountControls person={person} viewerId={state.data.userId} owner={owner}/>
        </article>)}
        {directory.data?.items.length===0&&<p className="text-sm text-muted-foreground">No people found.</p>}
      </div>}
      <div className="flex flex-wrap items-center gap-3 text-sm"><Button variant="outline" disabled={page===1||directory.isFetching} onClick={()=>setPage(p=>p-1)}>Previous</Button><span>Page {page} · {directory.data?.total??0} people</span><Button variant="outline" disabled={!directory.data||page*25>=directory.data.total||directory.isFetching} onClick={()=>setPage(p=>p+1)}>Next</Button></div>
    </>}
  </div>;
}
function DepartmentEditor({department,onSave}:{department?:Department;onSave:(name:string,archived?:boolean)=>Promise<void>}) {
  const [name,setName]=useState(department?.name??'');const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  async function save(archived?:boolean){setBusy(true);setError('');try{await onSave(name.trim(),archived);if(!department)setName('');}catch(e){setError(e instanceof Error?e.message:'Could not save department');}finally{setBusy(false);}}
  const id='department-'+(department?.id??'new');
  return <form className="space-y-2 rounded-lg border p-4" onSubmit={e=>{e.preventDefault();void save();}}>
    <Label htmlFor={id}>{department?'Department name':'Add a department'}{department?.archived?' (archived)':''}</Label>
    <div className="flex flex-wrap gap-2"><Input className="min-w-0 flex-1 basis-48" id={id} required maxLength={100} value={name} disabled={busy} onChange={e=>setName(e.target.value)}/><Button disabled={busy||!name.trim()} type="submit">{department?'Save name':'Add department'}</Button>
      {department&&<Button type="button" variant="outline" disabled={busy||!name.trim()} onClick={()=>void save(!department.archived)}>{department.archived?'Restore':'Archive'}</Button>}
    </div>{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  </form>;
}
