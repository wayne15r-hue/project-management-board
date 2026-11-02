-- Requires pg_cron + pg_net (already installed in production).
-- Apply only after all three migrations, application deployment and compatibility checks.
-- Separate jobs ensure database event generation survives application/provider outages.
begin;
select cron.schedule('workflow-generate-v1','*/5 * * * *', $$select public.workflow_generate();$$)
where not exists(select 1 from cron.job where jobname='workflow-generate-v1');
select cron.schedule('workflow-deliver-v1','*/5 * * * *', $$
 select net.http_post(
  url := 'https://project-management-board-iota.vercel.app/api/notifications/maintenance',
  headers := '{"Content-Type":"application/json"}'::jsonb,
  body := '{}'::jsonb,
  timeout_milliseconds := 30000
 );
$$) where not exists(select 1 from cron.job where jobname='workflow-deliver-v1');
-- Public wakeup consumes no caller targets. A service-only 60-second DB gate,
-- bounded batch and per-delivery leases prevent amplification across instances.
update public.workflow_runtime set producers_enabled=true where singleton;
commit;
select jobname,schedule,active from cron.job where jobname in ('workflow-generate-v1','workflow-deliver-v1');
-- Rollback scheduled work without destroying requests/history/delivery outcomes:
-- select cron.unschedule(jobid) from cron.job where jobname in ('workflow-generate-v1','workflow-deliver-v1');
-- Keep producers_enabled=true while old clients might send direct emails: it rejects
-- redundant legacy inserts before their old directsend. Stop producers only after
-- old email paths have been removed or intentionally restored with scheduling off.
