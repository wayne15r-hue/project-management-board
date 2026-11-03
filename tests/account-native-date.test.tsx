// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {DirectoryForm} from '@/components/employee/directory-form';
afterEach(cleanup);
it('submits the native joining-date value displayed by the browser',async()=>{
 const save=vi.fn().mockResolvedValue(undefined);
 render(<DirectoryForm initial={{employeeId:null,workLocation:null,joiningDate:null,employmentType:null}} onSave={save}/>);
 // Native date controls/autofill can update their displayed value before React receives change.
 const date=screen.getByLabelText('Employment joining date (optional)') as HTMLInputElement;
 date.value='2026-11-03';
 fireEvent.click(screen.getByRole('button',{name:'Save directory fields'}));
 await waitFor(()=>expect(save).toHaveBeenCalledWith(expect.objectContaining({joiningDate:'2026-11-03'})));
});
