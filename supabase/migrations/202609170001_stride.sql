-- Stride: private profiles, reciprocal friendship, day totals, avatar job quotas.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  handle text not null unique check (handle ~ '^[a-z0-9_]{3,24}$'),
  display_name text not null check (length(display_name) between 1 and 50),
  avatar_path text,
  created_at timestamptz not null default now()
);
create table public.friendships (
  requester uuid not null references public.profiles(id) on delete cascade,
  recipient uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted')),
  created_at timestamptz not null default now(),
  primary key(requester,recipient), check (requester <> recipient)
);
create unique index friendships_pair on public.friendships (least(requester,recipient),greatest(requester,recipient));
create table public.daily_progress (
  user_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  steps integer not null check (steps between 0 and 150000),
  goal integer not null check (goal between 1000 and 50000),
  source text not null check(source in ('ios-motion','health-connect')),
  updated_at timestamptz not null default now(),
  primary key(user_id,date)
);
create table public.avatar_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'processing' check (status in ('processing','ready','failed')),
  path text, created_at timestamptz not null default now(), finished_at timestamptz
);
create unique index avatar_single_job on public.avatar_jobs(user_id) where status='processing';
create index avatar_daily_quota on public.avatar_jobs(user_id,created_at);

create function public.on_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id,handle,display_name) values(new.id,lower(new.raw_user_meta_data->>'handle'),left(new.raw_user_meta_data->>'display_name',50));
  return new;
end $$;
create trigger stride_new_user after insert on auth.users for each row execute function public.on_new_user();

create function public.can_read_profile(p_user uuid) returns boolean language sql stable security definer set search_path=public as $$
  select auth.uid()=p_user or exists(select 1 from friendships where status='accepted' and ((requester=auth.uid() and recipient=p_user) or (recipient=auth.uid() and requester=p_user)));
$$;

alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.daily_progress enable row level security;
alter table public.avatar_jobs enable row level security;
create policy profile_read on public.profiles for select to authenticated using(public.can_read_profile(id));
create policy friendship_read on public.friendships for select to authenticated using(auth.uid() in (requester,recipient));
create policy progress_read on public.daily_progress for select to authenticated using(public.can_read_profile(user_id));
create policy job_read on public.avatar_jobs for select to authenticated using(user_id=auth.uid());
-- All writes go through validated RPCs or the authenticated avatar worker.
revoke all on public.profiles,public.friendships,public.daily_progress,public.avatar_jobs from anon,authenticated;
grant select on public.profiles,public.friendships,public.daily_progress,public.avatar_jobs to authenticated;

create function public.sync_steps(p_date date,p_steps integer,p_goal integer,p_source text) returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if p_date < current_date-1 or p_date > current_date+1 then raise exception 'Invalid day'; end if;
  if p_steps is null or p_steps<0 or p_steps>150000 or p_goal is null or p_goal<1000 or p_goal>50000 or p_source is null or p_source not in ('ios-motion','health-connect') then raise exception 'Invalid step total'; end if;
  insert into daily_progress(user_id,date,steps,goal,source) values(auth.uid(),p_date,p_steps,p_goal,p_source)
  on conflict(user_id,date) do update set steps=greatest(daily_progress.steps,excluded.steps), goal=case when daily_progress.steps=0 then excluded.goal else daily_progress.goal end,source=excluded.source,updated_at=now();
end $$;

create function public.request_friend(p_handle text) returns void language plpgsql security definer set search_path=public as $$
declare target uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if (select count(*) from friendships where requester=auth.uid() and created_at>now()-interval '1 day')>=30 then raise exception 'Try adding more friends tomorrow'; end if;
  select id into target from profiles where handle=lower(trim(p_handle));
  if target is null then raise exception 'No player found with that handle'; end if;
  if target=auth.uid() then raise exception 'That is your own handle'; end if;
  insert into friendships(requester,recipient) values(auth.uid(),target) on conflict do nothing;
end $$;
create function public.accept_friend(p_friend uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  update friendships set status='accepted' where requester=p_friend and recipient=auth.uid() and status='pending';
  if not found then raise exception 'No incoming request found'; end if;
end $$;
create function public.remove_friend(p_friend uuid) returns void language plpgsql security definer set search_path=public as $$
begin delete from friendships where (requester=auth.uid() and recipient=p_friend) or (recipient=auth.uid() and requester=p_friend); end $$;
create function public.friend_board(p_date date default current_date) returns table(id uuid,display_name text,handle text,steps integer,goal integer,avatar_path text,status text,requester uuid) language sql stable security definer set search_path=public as $$
  select p.id,p.display_name,p.handle,
    case when f.status='accepted' then coalesce(d.steps,0) else 0 end,
    case when f.status='accepted' then coalesce(d.goal,8000) else 8000 end,
    case when f.status='accepted' then p.avatar_path else null end,
    f.status,f.requester
  from friendships f join profiles p on p.id=case when f.requester=auth.uid() then f.recipient else f.requester end
  left join lateral(select dp.steps,dp.goal from daily_progress dp where dp.user_id=p.id and dp.date=p_date order by dp.updated_at desc limit 1) d on true
  where auth.uid() in (f.requester,f.recipient);
$$;

-- Atomic quota reservation called only by the worker after authenticating the user.
create function public.reserve_avatar(p_user uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare job uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
  update avatar_jobs set status='failed',finished_at=now() where user_id=p_user and status='processing' and created_at<now()-interval '10 minutes';
  if (select count(*) from avatar_jobs where user_id=p_user and created_at>now()-interval '1 day')>=3 then raise exception 'Avatar limit reached. Try again tomorrow.'; end if;
  insert into avatar_jobs(user_id) values(p_user) returning id into job;
  return job;
end $$;

revoke execute on function public.on_new_user() from public,anon,authenticated;
revoke execute on function public.can_read_profile(uuid), public.sync_steps(date,integer,integer,text), public.request_friend(text), public.accept_friend(uuid), public.remove_friend(uuid), public.friend_board(date) from public,anon;
grant execute on function public.can_read_profile(uuid), public.sync_steps(date,integer,integer,text), public.request_friend(text), public.accept_friend(uuid), public.remove_friend(uuid), public.friend_board(date) to authenticated;
revoke execute on function public.reserve_avatar(uuid) from public,anon,authenticated;
grant execute on function public.reserve_avatar(uuid) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('avatars','avatars',false,10485760,array['image/png','image/jpeg','image/webp']) on conflict(id) do nothing;
create policy avatar_read on storage.objects for select to authenticated using(bucket_id='avatars' and exists(select 1 from public.profiles p where p.avatar_path=name and public.can_read_profile(p.id)));
-- No client upload policy: originals never enter Storage; only the worker uploads generated atlases.
