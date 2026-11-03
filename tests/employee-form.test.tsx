// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EmployeeForm } from '@/components/employee/employee-form';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const departments=[{id:'it',name:'IT',archived:false}];
it('requires an explicit no-manager choice and retains values after a save error',async()=>{
  const save=vi.fn(async()=>{throw new Error('Please retry');});
  vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>[]})));
  render(<EmployeeForm userId="me" departments={departments} onSave={save}/>);
  fireEvent.change(screen.getByLabelText('Department'),{target:{value:'it'}});
  fireEvent.change(screen.getByLabelText('Job title'),{target:{value:'Engineer'}});
  expect(screen.getByRole('button',{name:'Save employee details'}).hasAttribute('disabled')).toBe(true);
  fireEvent.change(screen.getByLabelText('Reporting to'),{target:{value:'none'}});
  fireEvent.click(screen.getByRole('button',{name:'Save employee details'}));
  await waitFor(()=>expect(screen.getByRole('alert').textContent).toContain('Please retry'));
  expect(save).toHaveBeenCalledWith({departmentId:'it',jobTitle:'Engineer',managerId:null});
  expect((screen.getByLabelText('Job title') as HTMLInputElement).value).toBe('Engineer');
});
it('excludes self from the manager picker and retains an archived current department',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>[{id:'me',full_name:'Me',email:'me@test'},{id:'boss',full_name:'Boss',email:'boss@test'}]})));
  render(<EmployeeForm userId="me" departments={[{id:'old',name:'Old team',archived:true}]} initial={{departmentId:'old',jobTitle:'Lead',managerId:null}} onSave={async()=>{}}/>);
  await waitFor(()=>expect(screen.getByRole('option',{name:'Boss (boss@test)'})).toBeTruthy());
  expect(screen.queryByRole('option',{name:'Me (me@test)'})).toBeNull();
  expect(screen.getByRole('option',{name:'Old team (archived)'})).toBeTruthy();
});
