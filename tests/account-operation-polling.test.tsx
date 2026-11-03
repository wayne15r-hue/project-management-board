// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AccountControls } from '@/components/employee/account-controls';
import type { AccountPerson } from '@/types/accounts';
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals();});
it('bounds automatic pending polls and still permits an explicit refresh',async()=>{
  vi.useFakeTimers();
  const latestOperation={id:'op',actor_id:'admin',target_id:'worker',action:'deactivate' as const,status:'pending' as const,payload:{},attempts:0,last_error:null,created_at:'2026-11-03T00:00:00Z',updated_at:'2026-11-03T00:00:00Z'};
  const person:AccountPerson={id:'worker',full_name:'Worker',email:'worker@example.com',record:null,department:null,manager:null,adminRole:null,account:{status:'deactivated',createdAt:null,lastSignInAt:null,emailVerified:true,revision:1,formerAdmin:false},directory:{employeeId:null,workLocation:null,joiningDate:null,employmentType:null},latestOperation};
  let reads=0;vi.stubGlobal('fetch',vi.fn(async()=>{reads++;return {ok:true,json:async()=>latestOperation};}));
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
  render(<QueryClientProvider client={client}><AccountControls person={person} viewerId="admin" owner={false}/></QueryClientProvider>);
  await act(async()=>{await vi.advanceTimersByTimeAsync(75000);});
  expect(reads).toBe(13);
  await act(async()=>{await vi.advanceTimersByTimeAsync(75000);});
  expect(reads).toBe(13);
  fireEvent.click(screen.getByRole('button',{name:'Refresh operation status'}));
  await act(async()=>{await vi.advanceTimersByTimeAsync(1);});
  expect(reads).toBe(14);
  expect(screen.getByRole('button',{name:'Reactivate account'}).hasAttribute('disabled')).toBe(true);
});
