-- Run after the audio migration and deployed /api/calls/maintenance are ready.
-- No credentials or user data are placed in these HTTP requests.
begin;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create or replace function public.enqueue_audio_maintenance() returns trigger language plpgsql security definer set search_path=public as $$
begin
 perform net.http_post(url:='https://project-management-board-iota.vercel.app/api/calls/maintenance',body:='{}'::jsonb,timeout_milliseconds:=30000);
 return null;
end;$$;
revoke all on function public.enqueue_audio_maintenance() from public,anon,authenticated;
drop trigger if exists enqueue_audio_maintenance on public.audio_media_cleanup;
create trigger enqueue_audio_maintenance after insert on public.audio_media_cleanup for each statement execute function public.enqueue_audio_maintenance();
select cron.schedule('helios-audio-maintenance','* * * * *',$job$select net.http_post(url:='https://project-management-board-iota.vercel.app/api/calls/maintenance',body:='{}'::jsonb,timeout_milliseconds:=30000);$job$);
commit;
-- Verify cron.job_run_details AND net._http_response before enabling audio.
-- Roll back this schedule only: select cron.unschedule('helios-audio-maintenance');
