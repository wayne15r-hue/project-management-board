import { expect,it } from 'vitest';
import { employeeInput, departmentInput, adminInput } from '@/lib/employee/validation';
const id='00000000-0000-4000-8000-000000000001';
it('requires an explicit reporting choice and valid department and title',()=>{
  expect(employeeInput.safeParse({departmentId:id,jobTitle:'Engineer'}).success).toBe(false);
  expect(employeeInput.parse({departmentId:id,jobTitle:' Engineer ',managerId:null}).jobTitle).toBe('Engineer');
  expect(employeeInput.safeParse({departmentId:id,jobTitle:' ',managerId:null}).success).toBe(false);
  expect(employeeInput.safeParse({departmentId:id,jobTitle:'x'.repeat(201),managerId:null}).success).toBe(false);
  expect(employeeInput.safeParse({departmentId:'bad',jobTitle:'Title',managerId:null}).success).toBe(false);
});
it('rejects extra permissions, malformed department flags and nonboolean membership',()=>{
  expect(employeeInput.safeParse({departmentId:id,jobTitle:'CEO',managerId:null,role:'owner'}).success).toBe(false);
  expect(departmentInput.safeParse({id:null,name:'IT',archived:'false'}).success).toBe(false);
  expect(adminInput.safeParse({userId:id,enabled:'true'}).success).toBe(false);
});
