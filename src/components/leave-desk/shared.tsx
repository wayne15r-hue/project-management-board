"use client";
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
export { Field, ErrorNotice, control, actionClass } from '@/components/service-desk/shared';
export const panel='rounded-xl border border-border bg-card p-4 sm:p-6';
export const label=(text:string)=>text.replaceAll('_',' ').replace(/^./,c=>c.toUpperCase());
export function dateKey(date:Date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
export async function leaveRead<T>(path:string,signal?:AbortSignal):Promise<T>{const res=await fetch(`/api/leave-desk/${path}`,{cache:'no-store',signal});const data=await res.json();if(!res.ok)throw new Error(data.error||'Unable to load LeaveDesk');return data;}
export function useLeaveQuery<T>(userId:string,path:string){return useQuery({queryKey:['leave-desk',userId,path],queryFn:({signal})=>leaveRead<T>(path,signal),gcTime:0,retry:false,refetchOnWindowFocus:'always',refetchInterval:60000});}
export function useLeaveAccount(userId:string){const [valid,setValid]=useState(true);const client=useQueryClient();useEffect(()=>{const {data:{subscription}}=createClient().auth.onAuthStateChange((_e,s)=>{if(s?.user.id===userId)return;setValid(false);void client.cancelQueries({queryKey:['leave-desk',userId]}).then(()=>client.removeQueries({queryKey:['leave-desk',userId]}));});return()=>subscription.unsubscribe();},[client,userId]);return valid;}
export function useLeaveMutation(userId:string,path:string,onSuccess?:(data:unknown)=>void){
 const client=useQueryClient();const pending=useRef<{body:string;key:string;storage:string}|null>(null);const guard=useRef<AbortController|null>(null);const prefix=`leave-operation:${userId}:`;
 useEffect(()=>{const controller=new AbortController();guard.current=controller;const {data:{subscription}}=createClient().auth.onAuthStateChange((_e,s)=>{if(s?.user.id!==userId){controller.abort();try{Object.keys(sessionStorage).filter(k=>k.startsWith(prefix)).forEach(k=>sessionStorage.removeItem(k));}catch{/* Storage can be unavailable in private browsing. */}}});return()=>{controller.abort();subscription.unsubscribe();};},[userId,prefix]);
 return useMutation({mutationFn:async(body:Record<string,unknown>)=>{
  if(!guard.current||guard.current.signal.aborted)throw new Error('Your session changed. Refresh to continue.');
  const text=JSON.stringify(body);const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));const signature=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');const storage=`${prefix}${path}:${signature}`;
  if(pending.current?.body!==text){let key:string|null=null;try{key=sessionStorage.getItem(storage);}catch{/* Retain the in-memory retry key when storage is unavailable. */}pending.current={body:text,key:key??crypto.randomUUID(),storage};try{sessionStorage.setItem(storage,pending.current.key);}catch{/* Storage can be unavailable in private browsing. */}}
  if(guard.current.signal.aborted)throw new Error('Your session changed. Refresh to continue.');
  const res=await fetch(`/api/leave-desk/${path}`,{method:'POST',headers:{'Content-Type':'application/json'},signal:guard.current.signal,body:JSON.stringify({...body,key:pending.current.key})});const data=await res.json();if(!res.ok)throw new Error(data.error||'Unable to save. Please retry.');return data;
 },onSuccess:data=>{if(guard.current?.signal.aborted)return;if(pending.current){try{sessionStorage.removeItem(pending.current.storage);}catch{/* Optional storage. */}}pending.current=null;void client.invalidateQueries({queryKey:['leave-desk',userId]});window.dispatchEvent(new Event('leave-desk-updated'));onSuccess?.(data);}});
}
