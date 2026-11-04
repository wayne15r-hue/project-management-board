"use client";
import {useState} from 'react';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Button} from '@/components/ui/button';
import {nameSchema,type NameInput} from '@/lib/profile/name';
export function NameForm({onSave,submitLabel='Save name'}:{onSave:(name:NameInput)=>Promise<void>;submitLabel?:string}){
 const [firstName,setFirst]=useState('');const [lastName,setLast]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 return <form className="space-y-4" onSubmit={async event=>{event.preventDefault();const parsed=nameSchema.safeParse({firstName,lastName});if(!parsed.success){setError('Enter a first name of up to 100 characters and an optional surname of up to 100 characters, without control characters.');return;}setBusy(true);setError('');try{await onSave(parsed.data);}catch(e){setError(e instanceof Error?e.message:'Could not save your name. Please retry.');}finally{setBusy(false);}}}>
  <div className="space-y-2"><Label htmlFor="profile-first-name">First name</Label><Input id="profile-first-name" autoComplete="given-name" required maxLength={100} value={firstName} disabled={busy} onChange={e=>setFirst(e.target.value)}/></div>
  <div className="space-y-2"><Label htmlFor="profile-last-name">Last name (optional)</Label><Input id="profile-last-name" autoComplete="family-name" maxLength={100} value={lastName} disabled={busy} onChange={e=>setLast(e.target.value)}/></div>
  {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  <Button type="submit" className="min-h-11" disabled={busy}>{busy?'Saving…':submitLabel}</Button>
 </form>;
}
