-- Apply after the account migration and application deployment.
-- No credentials or user-supplied operations are sent by this wakeup.
select cron.schedule('account-maintenance-v1','* * * * *',$$
 select net.http_post(
  url := 'https://project-management-board-iota.vercel.app/api/accounts/maintenance',
  headers := '{"Content-Type":"application/json"}'::jsonb,
  body := '{}'::jsonb,
  timeout_milliseconds := 30000
 );
$$) where not exists(select 1 from cron.job where jobname='account-maintenance-v1');
select jobname,schedule,active from cron.job where jobname='account-maintenance-v1';
-- Rollback the application without dropping account data or audit history.
-- Keep this worker deployed while pending provider cleanup must finish.
