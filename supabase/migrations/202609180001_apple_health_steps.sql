-- Keep legacy phone readings while allowing Apple Health daily totals.
alter table public.daily_progress drop constraint daily_progress_source_check;
alter table public.daily_progress add constraint daily_progress_source_check
  check (source in ('ios-motion', 'apple-health', 'health-connect'));

create or replace function public.sync_steps(p_date date,p_steps integer,p_goal integer,p_source text) returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if p_date < current_date-1 or p_date > current_date+1 then raise exception 'Invalid day'; end if;
  if p_steps is null or p_steps<0 or p_steps>150000 or p_goal is null or p_goal<1000 or p_goal>50000 or p_source is null or p_source not in ('ios-motion','apple-health','health-connect') then raise exception 'Invalid step total'; end if;
  insert into daily_progress(user_id,date,steps,goal,source) values(auth.uid(),p_date,p_steps,p_goal,p_source)
  on conflict(user_id,date) do update set steps=greatest(daily_progress.steps,excluded.steps), goal=case when daily_progress.steps=0 then excluded.goal else daily_progress.goal end,source=excluded.source,updated_at=now();
end $$;
