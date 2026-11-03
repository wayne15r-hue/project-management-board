import { expect,it,vi } from 'vitest';
vi.mock('next/navigation',()=>({redirect:(path:string)=>{throw new Error('REDIRECT:'+path);}}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:'user'}}})},rpc:async()=>({data:{record:{completed_at:'now'}},error:null})})}));
vi.mock('@/components/employee/employee-setup',()=>({BoundEmployeeSetup:()=>null}));
import EmployeeSetupPage from '@/app/employee-setup/page';
it.each(['/dashboard?new=true','/dashboard/board/b?card=c','/invite/token?source=email'])('preserves the full safe setup destination %s',async next=>{
  await expect(EmployeeSetupPage({searchParams:Promise.resolve({next})})).rejects.toThrow('REDIRECT:'+next);
});
it.each(['/employee-setup','//evil.test','/dashboard-other'])('rejects invalid or looping destination %s',async next=>{
  await expect(EmployeeSetupPage({searchParams:Promise.resolve({next})})).rejects.toThrow('REDIRECT:/dashboard');
});
