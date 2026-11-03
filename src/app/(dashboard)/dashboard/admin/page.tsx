import { notFound,redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { EmployeeAdmin } from '@/components/employee/employee-admin';
export default async function AdminPage() {
  const client=await createClient();
  const {data:{user}}=await client.auth.getUser();
  if(!user)redirect('/login');
  const {data:role,error}=await client.rpc('employee_admin_role');
  if(error)throw new Error('Account permissions are temporarily unavailable.');
  if(!role)notFound();
  return <EmployeeAdmin/>;
}
