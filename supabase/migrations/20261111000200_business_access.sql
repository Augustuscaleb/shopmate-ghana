-- Business and access tables (09 §2 "Business and access")

create table public.businesses (
  id                      uuid primary key default gen_random_uuid(),
  name                    text not null check (char_length(btrim(name)) between 1 and 100),
  type                    text not null check (type in ('provision', 'minimart', 'boutique', 'other')),
  town                    text check (town is null or char_length(town) <= 100),
  phone                   text check (phone is null or phone ~ '^(\+233|0)[0-9]{9}$'),
  reference_code          text not null unique check (reference_code ~ '^SM-[0-9]{4,}$'),
  receipt_footer          text check (receipt_footer is null or char_length(receipt_footer) <= 200),
  default_low_stock_level integer not null default 5 check (default_low_stock_level >= 0),
  created_by              uuid references auth.users (id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  deleted_at              timestamptz
);

create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text check (full_name is null or char_length(full_name) <= 100),
  email      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.business_members (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        text not null default 'owner' check (role in ('owner')),  -- MVP: owner only (decision 7)
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (business_id, user_id)
);
create index business_members_user_idx on public.business_members (user_id) where active;

create table public.devices (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references public.businesses (id) on delete cascade,
  user_id          uuid not null references auth.users (id) on delete cascade,
  device_code      text not null check (device_code ~ '^[A-Z]{1,3}$'),
  label            text check (label is null or char_length(label) <= 60),
  last_seen_at     timestamptz,
  revoked_at       timestamptz,
  last_sequence_no bigint not null default 0 check (last_sequence_no >= 0),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (business_id, device_code),          -- 09 §4.4
  unique (id, business_id)
);

create table public.device_anchors (            -- 05 C-90
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses (id) on delete cascade,
  device_id       uuid not null,
  server_time     timestamptz not null default now(),
  elapsed_ms      bigint not null check (elapsed_ms >= 0),
  boot_id         text not null check (char_length(boot_id) <= 64),
  wall_clock      timestamptz not null,
  clock_offset_ms bigint not null,
  created_at      timestamptz not null default now(),
  unique (id, business_id),
  foreign key (device_id, business_id) references public.devices (id, business_id)
);
create index device_anchors_device_idx on public.device_anchors (device_id, server_time);

create table public.device_time_events (        -- 05 C-92, C-93
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  device_id   uuid not null,
  type        text not null check (type in ('reboot_detected', 'clock_changed')),
  detected_at timestamptz not null,
  elapsed_ms  bigint check (elapsed_ms is null or elapsed_ms >= 0),
  boot_id     text check (boot_id is null or char_length(boot_id) <= 64),
  change_ms   bigint,
  created_at  timestamptz not null default now(),
  check (type <> 'clock_changed' or change_ms is not null),
  foreign key (device_id, business_id) references public.devices (id, business_id)
);

-- ---------------------------------------------------------------------------
-- Membership helper used by every RLS policy
-- ---------------------------------------------------------------------------
create or replace function private.is_member(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_members m
    where m.business_id = p_business_id
      and m.user_id = (select auth.uid())
      and m.active
  );
$$;
revoke all on function private.is_member(uuid) from public;
grant execute on function private.is_member(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Profile row for every new auth user
-- ---------------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    nullif(left(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 100), '')
  );
  return new;
end;
$$;
revoke all on function private.handle_new_user() from public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();
