-- Agüita Surf — initial schema
-- Run in Supabase: SQL Editor → paste → Run, or `supabase db push`.

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user (created automatically on signup).
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles self read" on public.profiles;
create policy "profiles self read" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles self upsert" on public.profiles;
create policy "profiles self upsert" on public.profiles
  for insert with check (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- surf_preferences: per-user thresholds. Defaults encode the surf rule:
--   wave 0.5–1.5 m, near low tide (±1.5 h), wind < 18 km/h, daylight 07–20.
-- ---------------------------------------------------------------------------
create table if not exists public.surf_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  min_wave_m numeric not null default 0.5,
  max_wave_m numeric not null default 1.5,
  low_tide_window_h numeric not null default 1.5,
  max_wind_kmh numeric not null default 18,
  hour_start int not null default 7,
  hour_end int not null default 20,
  notify_hour int not null default 6, -- preferred daily check hour (local)
  updated_at timestamptz not null default now()
);

alter table public.surf_preferences enable row level security;

drop policy if exists "prefs self all" on public.surf_preferences;
create policy "prefs self all" on public.surf_preferences
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- push_subscriptions: one row per device (Web Push subscription object).
-- ---------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "subs self all" on public.push_subscriptions;
create policy "subs self all" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- notifications_log: anti-spam — at most one surf alert per user per day.
-- ---------------------------------------------------------------------------
create table if not exists public.notifications_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  reason text,
  sent_at timestamptz not null default now(),
  unique (user_id, day)
);

alter table public.notifications_log enable row level security;

drop policy if exists "log self read" on public.notifications_log;
create policy "log self read" on public.notifications_log
  for select using (auth.uid() = user_id);
-- inserts happen only via the service-role cron (bypasses RLS).

-- ---------------------------------------------------------------------------
-- On signup: create profile + default preferences automatically.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;

  insert into public.surf_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
