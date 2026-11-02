import { beforeEach,afterEach,expect,it,vi } from 'vitest';
const state=vi.hoisted(()=>({run:vi.fn()}));
vi.mock('@/lib/workflows/maintenance',()=>({runWorkflowMaintenance:state.run}));
import { GET } from '@/app/api/cron/due-date-reminders/route';
import { POST } from '@/app/api/notifications/maintenance/route';
beforeEach(()=>{state.run.mockReset();state.run.mockResolvedValue(undefined);vi.stubEnv('CRON_SECRET','cron-secret');});
afterEach(()=>vi.unstubAllEnvs());
it('preserves authentication on the legacy timer',async()=>{
 for(const secret of ['', 'wrong']){vi.stubEnv('CRON_SECRET',secret);expect((await GET(new Request('https://app.test/api/cron/due-date-reminders',{headers:{authorization:'Bearer undefined'}}))).status).toBe(401);}
 expect(state.run).not.toHaveBeenCalled();
});
it('delegates authorized legacy timers to the exact same durable worker',async()=>{expect((await GET(new Request('https://app.test/api/cron/due-date-reminders',{headers:{authorization:'Bearer cron-secret'}}))).status).toBe(200);expect(state.run).toHaveBeenCalledOnce();});
it('public maintenance consumes no caller-controlled targets and returns only generic state',async()=>{
 const result=await Reflect.apply(POST,undefined,[new Request('https://app.test/api/notifications/maintenance?recipient=outsider',{method:'POST',body:JSON.stringify({boardId:'private',recipient:'outsider',text:'Injected'})})]);expect(await result.json()).toEqual({ok:true});expect(state.run).toHaveBeenCalledWith();
});
it('redacts maintenance errors',async()=>{state.run.mockRejectedValue(new Error('sensitive token'));const result=await POST();expect(result.status).toBe(503);expect(await result.json()).toEqual({error:'Maintenance unavailable'});});
