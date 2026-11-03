// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { EmployeeDetails } from '@/components/employee/employee-details';
afterEach(cleanup);
it('shows optional employment directory fields independently from the original setup record',()=>{
  render(<EmployeeDetails state={{userId:'me',role:null,record:null,departments:[],manager:null}} directory={{employeeId:'E-9',joiningDate:'2026-02-03',employmentType:'Contract',workLocation:'Pune'}}/>);
  expect(screen.getByText('E-9')).toBeTruthy();expect(screen.getByText('Pune')).toBeTruthy();
  expect(screen.getByText('Employment joining date')).toBeTruthy();expect(screen.getByText('2026-02-03')).toBeTruthy();
});
