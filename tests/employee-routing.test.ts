import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ getUser:vi.fn(), maybeSingle:vi.fn() }));
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({auth:{getUser:mocks.getUser},from:()=>({select:()=>({eq:()=>({maybeSingle:mocks.maybeSingle})})})}) }));
import { updateSession } from '@/lib/supabase/middleware';
beforeEach(() => {
  mocks.getUser.mockResolvedValue({data:{user:{id:'user'}}});
  mocks.maybeSingle.mockResolvedValue({data:null,error:null});
});
it('requires existing and new users to complete setup and preserves deep links',async()=>{
  const r=await updateSession(new NextRequest('https://app.test/dashboard/board/b?card=c'));
  expect(r.status).toBe(307);
  const url=new URL(r.headers.get('location')!);
  expect(url.pathname).toBe('/employee-setup');
  expect(url.searchParams.get('next')).toBe('/dashboard/board/b?card=c');
});
it('preserves invitations through setup',async()=>{
  const r=await updateSession(new NextRequest('https://app.test/invite/abc'));
  expect(new URL(r.headers.get('location')!).searchParams.get('next')).toBe('/invite/abc');
});
it('returns actionable API errors for incomplete accounts without blocking setup',async()=>{
  const r=await updateSession(new NextRequest('https://app.test/api/boards'));
  expect(r.status).toBe(403); expect((await r.json()).code).toBe('EMPLOYEE_SETUP_REQUIRED');
  expect((await updateSession(new NextRequest('https://app.test/api/employee/setup'))).status).toBe(200);
});
it('allows completed users and keeps recovery accessible',async()=>{
  mocks.maybeSingle.mockResolvedValue({data:{completed_at:'now'},error:null});
  expect((await updateSession(new NextRequest('https://app.test/dashboard'))).status).toBe(200);
  mocks.maybeSingle.mockResolvedValue({data:null,error:null});
  expect((await updateSession(new NextRequest('https://app.test/update-password'))).status).toBe(200);
  expect((await updateSession(new NextRequest('https://app.test/employee-setup'))).status).toBe(200);
});
it('fails closed on a setup lookup error',async()=>{
  mocks.maybeSingle.mockResolvedValue({data:null,error:{message:'failure'}});
  expect((await updateSession(new NextRequest('https://app.test/dashboard'))).status).toBe(503);
});
