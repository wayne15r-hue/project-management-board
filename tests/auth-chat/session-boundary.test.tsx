// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
const auth=vi.hoisted(()=>({listener:null as null|((event:string,session:{user:{id:string}}|null)=>void),replace:vi.fn(),refresh:vi.fn(),unsubscribe:vi.fn()}));
vi.mock('next/navigation',()=>({useRouter:()=>({replace:auth.replace,refresh:auth.refresh})}));
vi.mock('@/lib/supabase/client',()=>({createClient:()=>({auth:{onAuthStateChange:(cb:typeof auth.listener)=>{auth.listener=cb;return {data:{subscription:{unsubscribe:auth.unsubscribe}}};}}})}));
import {AuthSessionBoundary} from '@/components/shared/auth-session-boundary';
afterEach(()=>{cleanup();vi.clearAllMocks();});
it('removes the previous account UI immediately when identity changes',async()=>{
  render(<AuthSessionBoundary userId="bruce"><p>Private Bruce content</p></AuthSessionBoundary>);
  expect(screen.getByText('Private Bruce content')).toBeTruthy();
  await act(async()=>auth.listener!('SIGNED_IN',{user:{id:'goku'}}));
  expect(screen.queryByText('Private Bruce content')).toBeNull();
  expect(auth.replace).toHaveBeenCalledWith('/dashboard');
  expect(auth.refresh).toHaveBeenCalled();
});
it('keeps content on a token refresh but clears it on signout',async()=>{
  render(<AuthSessionBoundary userId="bruce"><p>Private Bruce content</p></AuthSessionBoundary>);
  await act(async()=>auth.listener!('TOKEN_REFRESHED',{user:{id:'bruce'}}));
  expect(screen.getByText('Private Bruce content')).toBeTruthy();
  await act(async()=>auth.listener!('SIGNED_OUT',null));
  expect(screen.queryByText('Private Bruce content')).toBeNull();
  expect(auth.replace).toHaveBeenCalledWith('/login');
});
