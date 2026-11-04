// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {VideoPreview} from '@/components/calls/video-preview';
afterEach(()=>{cleanup();vi.restoreAllMocks();});
it('requests no device on open and stops a late camera result after cancellation',async()=>{
 let resolve!:(stream:MediaStream)=>void;const acquire=vi.fn(()=>new Promise<MediaStream>(r=>{resolve=r;}));const stop=vi.fn();
 Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:acquire,enumerateDevices:async()=>[]}});
 const view=render(<VideoPreview onCancel={()=>{}} onJoin={()=>{}} cameraAllowed/>);expect(acquire).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Preview camera'}));view.unmount();
 await act(async()=>resolve({getTracks:()=>[{stop}]} as unknown as MediaStream));expect(stop).toHaveBeenCalled();
});
it('keeps join without camera usable after camera denial',async()=>{
 Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>{throw new DOMException('denied','NotAllowedError');},enumerateDevices:async()=>[]}});
 const join=vi.fn();render(<VideoPreview onCancel={()=>{}} onJoin={join} cameraAllowed/>);
 fireEvent.click(screen.getByRole('button',{name:'Preview camera'}));await screen.findByRole('alert');
 fireEvent.click(screen.getByRole('button',{name:'Join without camera'}));expect(join).toHaveBeenCalledWith(expect.objectContaining({camera:false,microphone:false}));
});
