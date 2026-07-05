create extension if not exists pgcrypto;

do $$ begin
    create type public.playtest_status as enum ('upcoming', 'voting', 'closed', 'finished');
exception
    when duplicate_object then null;
end $$;

do $$ begin
    create type public.availability_status as enum ('available', 'preferred', 'maybe', 'unavailable');
exception
    when duplicate_object then null;
end $$;

do $$ begin
    create type public.game_mode_preference as enum ('battle_royale', 'deathmatch', 'either');
exception
    when duplicate_object then null;
end $$;

create table if not exists public.profiles (
    id uuid primary key references auth.users (id) on delete cascade,
    discord_id text unique not null,
    username text not null,
    avatar_url text,
    is_admin boolean not null default false,
    banned_from_voting boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.playtests (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    description text not null default '',
    main_slot_id uuid,
    status public.playtest_status not null default 'voting',
    created_by uuid references public.profiles (id) on delete set null,
    votes_frozen boolean not null default false,
    archived_at timestamptz,
    discord_channel_id text,
    discord_message_id text,
    discord_confirmation_channel_id text,
    discord_admin_channel_id text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.playtest_slots (
    id uuid primary key default gen_random_uuid(),
    playtest_id uuid not null references public.playtests (id) on delete cascade,
    start_datetime timestamptz not null,
    end_datetime timestamptz,
    label text not null default '',
    is_main boolean not null default false,
    source text not null default 'featured' check (source in ('featured', 'community')),
    confirmed_at timestamptz,
    confirmed_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now(),
    unique (id, playtest_id)
);

alter table public.playtest_slots
    add column if not exists end_datetime timestamptz;

do $$ begin
    alter table public.playtests
        add constraint playtests_main_slot_id_fkey
        foreign key (main_slot_id) references public.playtest_slots (id) on delete set null;
exception
    when duplicate_object then null;
end $$;

create unique index if not exists playtest_slots_one_main_idx
    on public.playtest_slots (playtest_id)
    where is_main;

create table if not exists public.availability (
    id uuid primary key default gen_random_uuid(),
    playtest_id uuid not null references public.playtests (id) on delete cascade,
    slot_id uuid not null,
    user_id uuid not null references public.profiles (id) on delete cascade,
    status public.availability_status not null,
    mode_preference public.game_mode_preference not null default 'either',
    available_start_datetime timestamptz,
    available_end_datetime timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (playtest_id, slot_id, user_id),
    foreign key (slot_id, playtest_id) references public.playtest_slots (id, playtest_id) on delete cascade
);

alter table public.availability
    add column if not exists available_start_datetime timestamptz,
    add column if not exists available_end_datetime timestamptz;

create unique index if not exists playtest_slots_one_confirmed_idx
    on public.playtest_slots (playtest_id)
    where confirmed_at is not null;

create table if not exists public.playtest_notification_subscriptions (
    id uuid primary key default gen_random_uuid(),
    playtest_id uuid not null references public.playtests (id) on delete cascade,
    slot_id uuid not null,
    user_id uuid not null references public.profiles (id) on delete cascade,
    notify_on_confirmation boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (playtest_id, slot_id, user_id),
    foreign key (slot_id, playtest_id) references public.playtest_slots (id, playtest_id) on delete cascade
);

create table if not exists public.playtest_vote_events (
    id uuid primary key default gen_random_uuid(),
    playtest_id uuid not null references public.playtests (id) on delete cascade,
    slot_id uuid not null,
    user_id uuid references public.profiles (id) on delete set null,
    status public.availability_status,
    available_start_datetime timestamptz,
    available_end_datetime timestamptz,
    available_total integer not null default 0,
    preferred_total integer not null default 0,
    total_votes integer not null default 0,
    created_at timestamptz not null default now(),
    foreign key (slot_id, playtest_id) references public.playtest_slots (id, playtest_id) on delete cascade
);

alter table public.playtest_vote_events
    add column if not exists available_start_datetime timestamptz,
    add column if not exists available_end_datetime timestamptz;

create table if not exists public.playtest_bans (
    user_id uuid primary key references public.profiles (id) on delete cascade,
    reason text not null default '',
    created_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_playtests_updated_at on public.playtests;
create trigger set_playtests_updated_at
before update on public.playtests
for each row execute function public.set_updated_at();

drop trigger if exists set_availability_updated_at on public.availability;
create trigger set_availability_updated_at
before update on public.availability
for each row execute function public.set_updated_at();

drop trigger if exists set_playtest_notification_subscriptions_updated_at on public.playtest_notification_subscriptions;
create trigger set_playtest_notification_subscriptions_updated_at
before update on public.playtest_notification_subscriptions
for each row execute function public.set_updated_at();

create or replace function public.log_playtest_vote_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    available_count integer;
    preferred_count integer;
    vote_count integer;
begin
    select
        count(*) filter (where status in ('available', 'preferred')),
        count(*) filter (where status = 'preferred'),
        count(*)
    into available_count, preferred_count, vote_count
    from public.availability
    where playtest_id = new.playtest_id
      and slot_id = new.slot_id;

    insert into public.playtest_vote_events (
        playtest_id,
        slot_id,
        user_id,
        status,
        available_start_datetime,
        available_end_datetime,
        available_total,
        preferred_total,
        total_votes
    )
    values (
        new.playtest_id,
        new.slot_id,
        new.user_id,
        new.status,
        new.available_start_datetime,
        new.available_end_datetime,
        available_count,
        preferred_count,
        vote_count
    );

    return new;
end;
$$;

drop trigger if exists log_playtest_vote_event_after_change on public.availability;
create trigger log_playtest_vote_event_after_change
after insert or update on public.availability
for each row execute function public.log_playtest_vote_event();

create or replace function public.is_playtest_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
    select exists (
        select 1
        from public.profiles
        where id = auth.uid()
          and is_admin = true
    );
$$;

create or replace function public.can_vote_on_playtest(target_playtest_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
    select exists (
        select 1
        from public.playtests p
        join public.profiles pr on pr.id = auth.uid()
        left join public.playtest_bans b on b.user_id = pr.id
        where p.id = target_playtest_id
          and p.status = 'voting'
          and p.votes_frozen = false
          and p.archived_at is null
          and pr.banned_from_voting = false
          and b.user_id is null
    );
$$;

alter table public.profiles enable row level security;
alter table public.playtests enable row level security;
alter table public.playtest_slots enable row level security;
alter table public.availability enable row level security;
alter table public.playtest_notification_subscriptions enable row level security;
alter table public.playtest_vote_events enable row level security;
alter table public.playtest_bans enable row level security;

grant usage on schema public to anon, authenticated;

revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to anon, authenticated;
grant insert (id, discord_id, username, avatar_url) on table public.profiles to authenticated;
grant update (username, avatar_url) on table public.profiles to authenticated;

grant select on table public.playtests to anon, authenticated;
grant insert, update, delete on table public.playtests to authenticated;
grant select on table public.playtest_slots to anon, authenticated;
grant insert, update, delete on table public.playtest_slots to authenticated;
grant select on table public.availability to anon, authenticated;
grant insert, update, delete on table public.availability to authenticated;
grant select, insert, update, delete on table public.playtest_notification_subscriptions to authenticated;
grant select on table public.playtest_vote_events to authenticated;
grant select, insert on table public.playtest_vote_events to service_role;
grant select, insert, update, delete on table public.playtest_bans to authenticated;
grant all on all tables in schema public to service_role;

drop policy if exists "Profiles are readable" on public.profiles;
create policy "Profiles are readable"
on public.profiles for select
using (true);

drop policy if exists "Users insert own profile" on public.profiles;
create policy "Users insert own profile"
on public.profiles for insert
with check (id = auth.uid());

drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile"
on public.profiles for update
using (id = auth.uid() or public.is_playtest_admin())
with check (id = auth.uid() or public.is_playtest_admin());

drop policy if exists "Visible playtests are readable" on public.playtests;
create policy "Visible playtests are readable"
on public.playtests for select
using (archived_at is null or public.is_playtest_admin());

drop policy if exists "Admins manage playtests" on public.playtests;
create policy "Admins manage playtests"
on public.playtests for all
using (public.is_playtest_admin())
with check (public.is_playtest_admin());

drop policy if exists "Visible slots are readable" on public.playtest_slots;
create policy "Visible slots are readable"
on public.playtest_slots for select
using (
    exists (
        select 1 from public.playtests p
        where p.id = playtest_id
          and (p.archived_at is null or public.is_playtest_admin())
    )
);

drop policy if exists "Admins manage slots" on public.playtest_slots;
create policy "Admins manage slots"
on public.playtest_slots for all
using (public.is_playtest_admin())
with check (public.is_playtest_admin());

drop policy if exists "Votes are readable" on public.availability;
create policy "Votes are readable"
on public.availability for select
using (true);

drop policy if exists "Users insert own vote" on public.availability;
create policy "Users insert own vote"
on public.availability for insert
with check (
    user_id = auth.uid()
    and public.can_vote_on_playtest(playtest_id)
    and exists (
        select 1
        from public.playtest_slots s
        where s.id = slot_id
          and s.playtest_id = availability.playtest_id
          and s.start_datetime > now()
    )
);

drop policy if exists "Users update own vote" on public.availability;
create policy "Users update own vote"
on public.availability for update
using (
    user_id = auth.uid()
    and public.can_vote_on_playtest(playtest_id)
)
with check (
    user_id = auth.uid()
    and public.can_vote_on_playtest(playtest_id)
    and exists (
        select 1
        from public.playtest_slots s
        where s.id = slot_id
          and s.playtest_id = availability.playtest_id
          and s.start_datetime > now()
    )
);

drop policy if exists "Users delete own vote" on public.availability;
create policy "Users delete own vote"
on public.availability for delete
using (user_id = auth.uid() or public.is_playtest_admin());

drop policy if exists "Users read own notification subscriptions" on public.playtest_notification_subscriptions;
create policy "Users read own notification subscriptions"
on public.playtest_notification_subscriptions for select
using (user_id = auth.uid() or public.is_playtest_admin());

drop policy if exists "Users insert own notification subscriptions" on public.playtest_notification_subscriptions;
create policy "Users insert own notification subscriptions"
on public.playtest_notification_subscriptions for insert
with check (
    user_id = auth.uid()
    and public.can_vote_on_playtest(playtest_id)
);

drop policy if exists "Users update own notification subscriptions" on public.playtest_notification_subscriptions;
create policy "Users update own notification subscriptions"
on public.playtest_notification_subscriptions for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users delete own notification subscriptions" on public.playtest_notification_subscriptions;
create policy "Users delete own notification subscriptions"
on public.playtest_notification_subscriptions for delete
using (user_id = auth.uid() or public.is_playtest_admin());

drop policy if exists "Admins read vote events" on public.playtest_vote_events;
create policy "Admins read vote events"
on public.playtest_vote_events for select
using (public.is_playtest_admin());

drop policy if exists "Admins insert vote events" on public.playtest_vote_events;
create policy "Admins insert vote events"
on public.playtest_vote_events for insert
with check (public.is_playtest_admin());

drop policy if exists "Admins read bans" on public.playtest_bans;
create policy "Admins read bans"
on public.playtest_bans for select
using (public.is_playtest_admin());

drop policy if exists "Admins manage bans" on public.playtest_bans;
create policy "Admins manage bans"
on public.playtest_bans for all
using (public.is_playtest_admin())
with check (public.is_playtest_admin());

create index if not exists availability_slot_status_idx on public.availability (slot_id, status);
create index if not exists availability_user_idx on public.availability (user_id);
create index if not exists notification_subscriptions_slot_idx on public.playtest_notification_subscriptions (slot_id);
create index if not exists playtest_vote_events_playtest_idx on public.playtest_vote_events (playtest_id, created_at desc);
create index if not exists playtests_status_idx on public.playtests (status, created_at);

notify pgrst, 'reload schema';
