// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
const auth=vi.hoisted(()=>({password:vi.fn(),oauth:vi.fn(),push:vi.fn(),refresh:vi.fn()}));
vi.mock('next/navigation',()=>({useRouter:()=>({push:auth.push,refresh:auth.refresh}),useSearchParams:()=>new URLSearchParams('next=%2Fdashboard%2Fchat')}));
vi.mock('@/lib/supabase/client',()=>({createClient:()=>({auth:{signInWithPassword:auth.password,signInWithOAuth:auth.oauth}})}));
import Login from '@/app/(auth)/login/page';
beforeEach(()=>{auth.password.mockReset().mockResolvedValue({error:null});auth.oauth.mockReset();auth.push.mockReset();});
afterEach(cleanup);
it('advances an unknown formatted email locally and preserves it when changed',()=>{
 render(<Login/>);expect(screen.queryByLabelText('Password')).toBeNull();
 fireEvent.change(screen.getByLabelText(/Email/i),{target:{value:'unknown@example.test'}});fireEvent.click(screen.getByRole('button',{name:'Next'}));
 expect(screen.getByLabelText('Password')).toBeTruthy();expect(auth.password).not.toHaveBeenCalled();expect(auth.oauth).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Change email'}));expect((screen.getByLabelText(/Email/i) as HTMLInputElement).value).toBe('unknown@example.test');
});
it('retains password-manager fields and typed password through visibility toggling, then preserves the redirect',async()=>{
 render(<Login/>);fireEvent.change(screen.getByLabelText(/Email/i),{target:{value:'jordan@example.test'}});fireEvent.click(screen.getByRole('button',{name:'Next'}));
 const password=screen.getByLabelText('Password') as HTMLInputElement;fireEvent.change(password,{target:{value:'A typed password'}});
 fireEvent.click(screen.getByRole('button',{name:'Show password'}));expect(password.type).toBe('text');expect(password.value).toBe('A typed password');expect(password.autocomplete).toBe('current-password');
 fireEvent.click(screen.getByRole('button',{name:'Hide password'}));expect(password.type).toBe('password');
 fireEvent.click(screen.getByRole('button',{name:'Sign in'}));await waitFor(()=>expect(auth.push).toHaveBeenCalledWith('/dashboard/chat'));
 expect(auth.password).toHaveBeenCalledWith({email:'jordan@example.test',password:'A typed password'});
});
