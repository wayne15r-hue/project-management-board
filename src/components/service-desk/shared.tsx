"use client";
import { cloneElement, useEffect, useId, useRef, useState, type ReactElement } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { TicketType } from '@/types/service-desk';
export const control='w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-50';
export const actionClass='rounded-md border border-border px-3 py-2 text-sm hover:bg-accent disabled:opacity-50';
export function Field({label,children}:{label:string;children:ReactElement<{id?:string}>}) {
 const id=useId();
 return <div className="flex min-w-0 flex-col gap-1.5 text-sm font-medium"><label htmlFor={id}>{label}</label>{cloneElement(children,{id})}</div>;
}
export function ErrorNotice({message,retry}:{message:string;retry?:()=>void}) {return <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm"><p>{message}</p>{retry&&<button type="button" className="mt-2 underline" onClick={retry}>Retry</button>}</div>;}
export async function deskRead<T>(url:string,signal?:AbortSignal):Promise<T>{
 const res=await fetch(url,{signal,cache:'no-store'});const body=await res.json();
 if(!res.ok)throw new Error(body.error||'Unable to load Service Desk');return body;
}
export function useDeskAccount(userId:string) {
 const client=useQueryClient();const [valid,setValid]=useState(true);
 useEffect(()=>{const {data:{subscription}}=createClient().auth.onAuthStateChange((_e,s)=>{
  if(s?.user.id===userId)return;
  setValid(false);void client.cancelQueries({queryKey:['service-desk',userId]}).then(()=>client.removeQueries({queryKey:['service-desk',userId]}));
 });return()=>subscription.unsubscribe();},[client,userId]);return valid;
}
export function useDeskGuard(userId:string){
 const current=useRef({active:true,controller:new AbortController()});
 useEffect(()=>{
  const state={active:true,controller:new AbortController()};current.current=state;
  const {data:{subscription}}=createClient().auth.onAuthStateChange((_e,s)=>{if(s?.user.id!==userId){state.active=false;state.controller.abort();}});
  return()=>{state.active=false;state.controller.abort();subscription.unsubscribe();};
 },[userId]);return current;
}
export function useDeskMutation(userId:string,url:string,onSuccess?:(data:unknown)=>void){
 const client=useQueryClient();const pending=useRef<{fingerprint:string;operationId:string}|null>(null);const guard=useDeskGuard(userId);
 return useMutation({mutationFn:async(body:Record<string,unknown>)=>{
  const fingerprint=JSON.stringify(body);
  if(pending.current?.fingerprint!==fingerprint)pending.current={fingerprint,operationId:crypto.randomUUID()};
  if(!guard.current.active)throw new Error('Your session changed. Refresh to continue.');
  const response=await fetch(url,{method:'POST',signal:guard.current.controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,operationId:pending.current.operationId})});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'Unable to save request. Please retry.');
  return data;
 },onSuccess:data=>{if(!guard.current.active)return;pending.current=null;void client.invalidateQueries({queryKey:['service-desk',userId]});window.dispatchEvent(new Event('service-desk-updated'));onSuccess?.(data);}});
}
export const requestFields:Record<TicketType,{key:string;label:string;kind?:string}[]>={
 it_issue:[{key:'system',label:'Affected system'},{key:'impact',label:'Impact'}],
 access_request:[{key:'system',label:'System'},{key:'access_level',label:'Access level'},{key:'reason',label:'Reason'}],
 purchase_request:[{key:'tool',label:'Tool or equipment'},{key:'cost',label:'Cost',kind:'number'},{key:'currency',label:'Currency'},{key:'reason',label:'Reason'}],
 technical_request:[{key:'system',label:'Affected system'},{key:'expected_behavior',label:'Expected behavior'}],
};
export function RequestFields({type,fields,setFields}:{type:TicketType;fields:Record<string,string>;setFields:(v:Record<string,string>)=>void}){
 return <>{requestFields[type].map(f=><Field key={f.key} label={f.label}><input className={control} required maxLength={5000} type={f.kind??'text'} min={f.kind==='number'?0:undefined} step={f.kind==='number'?'0.01':undefined} value={fields[f.key]??''} onChange={e=>setFields({...fields,[f.key]:f.key==='currency'?e.target.value.toUpperCase():e.target.value})}/></Field>)}</>;
}
