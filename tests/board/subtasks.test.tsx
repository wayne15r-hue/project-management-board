// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Subtasks } from "../../src/components/board/subtasks";
afterEach(()=>{cleanup();vi.unstubAllGlobals()});
it("restores the original subtask name on an HTTP rename failure",async()=>{
  vi.stubGlobal("fetch",vi.fn().mockResolvedValueOnce({ok:true,json:async()=>[{id:"s",title:"Original task",completed:false}]}).mockResolvedValue({ok:false}));
  render(<Subtasks cardId="c" />);
  const input=await screen.findByDisplayValue("Original task");fireEvent.change(input,{target:{value:"Renamed task"}});fireEvent.blur(input);
  await screen.findByDisplayValue("Original task");
});
it("restores a subtask on an HTTP deletion failure",async()=>{
  vi.stubGlobal("fetch",vi.fn().mockResolvedValueOnce({ok:true,json:async()=>[{id:"s",title:"Original task",completed:false}]}).mockResolvedValue({ok:false}));
  render(<Subtasks cardId="c" />);
  await screen.findByDisplayValue("Original task");fireEvent.click(screen.getByRole("button",{name:"Delete subtask"}));
  await screen.findByDisplayValue("Original task");
});
it("keeps a successfully deleted subtask removed",async()=>{
  const request=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>[{id:"s",title:"Original task",completed:false}]}).mockResolvedValue({ok:true});
  vi.stubGlobal("fetch",request);
  render(<Subtasks cardId="c" />);
  await screen.findByDisplayValue("Original task");fireEvent.click(screen.getByRole("button",{name:"Delete subtask"}));
  await waitFor(()=>expect(request).toHaveBeenCalledTimes(2));
  expect(screen.queryByDisplayValue("Original task")).toBeNull();
});
