-- Restaurant Table Booking & CRM schema
-- Public site uses the anon key: it can read site content and must go through
-- the security-definer RPCs below to check availability and create bookings.
-- Everything else is staff-only via RLS.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
do $$ begin
  create type booking_status as enum ('pending','confirmed','seated','completed','cancelled','no_show');
exception when duplicate_object then null; end $$;

do $$ begin
  create type staff_role as enum ('admin','staff');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists site_settings (
  id                       int primary key default 1 check (id = 1),
  restaurant_name          text not null default 'La Tavola',
  tagline                  text not null default 'Seasonal Italian kitchen & wine bar',
  hero_title               text not null default 'A table is waiting for you',
  hero_subtitle            text not null default 'Handmade pasta, wood-fired dishes and a wine list worth lingering over.',
  hero_image_url           text not null default 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1600&q=80',
  about_title              text not null default 'Our story',
  about_text               text not null default 'Since 2012 we have cooked simple food from great ingredients. Everything from our bread to our pasta is made in-house every morning.',
  address                  text not null default '12 Market Street, Singapore 048942',
  phone                    text not null default '+65 6123 4567',
  email                    text not null default 'hello@latavola.example',
  timezone                 text not null default 'Asia/Singapore',
  -- {"mon":{"closed":false,"open":"12:00","close":"22:00"}, ...}
  opening_hours            jsonb not null default '{
    "mon":{"closed":true, "open":"12:00","close":"22:00"},
    "tue":{"closed":false,"open":"12:00","close":"22:00"},
    "wed":{"closed":false,"open":"12:00","close":"22:00"},
    "thu":{"closed":false,"open":"12:00","close":"22:00"},
    "fri":{"closed":false,"open":"12:00","close":"23:00"},
    "sat":{"closed":false,"open":"11:00","close":"23:00"},
    "sun":{"closed":false,"open":"11:00","close":"21:00"}
  }'::jsonb,
  slot_interval_minutes    int not null default 30  check (slot_interval_minutes between 5 and 120),
  booking_duration_minutes int not null default 90  check (booking_duration_minutes between 15 and 480),
  max_party_size           int not null default 10  check (max_party_size between 1 and 100),
  booking_window_days      int not null default 60  check (booking_window_days between 1 and 365),
  min_notice_minutes       int not null default 60  check (min_notice_minutes >= 0),
  auto_confirm             boolean not null default true,
  booking_enabled          boolean not null default true,
  updated_at               timestamptz not null default now()
);
insert into site_settings (id) values (1) on conflict do nothing;

create table if not exists menu_items (
  id          uuid primary key default gen_random_uuid(),
  category    text not null default 'Mains',
  name        text not null,
  description text not null default '',
  price       numeric(10,2) not null default 0 check (price >= 0),
  is_featured boolean not null default false,
  is_active   boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists restaurant_tables (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  capacity   int not null check (capacity between 1 and 100),
  area       text not null default 'Main',
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists customers (
  id         uuid primary key default gen_random_uuid(),
  full_name  text not null,
  email      text,
  phone      text,
  notes      text not null default '',
  tags       text[] not null default '{}',
  is_vip     boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists customers_email_key on customers (lower(email)) where email is not null;

create table if not exists bookings (
  id               uuid primary key default gen_random_uuid(),
  reference        text not null unique,
  customer_id      uuid not null references customers(id) on delete restrict,
  table_id         uuid references restaurant_tables(id) on delete set null,
  booking_date     date not null,
  start_time       time not null,
  end_time         time not null,
  party_size       int not null check (party_size > 0),
  status           booking_status not null default 'pending',
  source           text not null default 'website' check (source in ('website','phone','walk_in','staff')),
  special_requests text not null default '',
  internal_notes   text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (end_time > start_time)
);
create index if not exists bookings_date_idx on bookings (booking_date, start_time);
create index if not exists bookings_customer_idx on bookings (customer_id);

create table if not exists staff (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  full_name  text not null default '',
  role       staff_role not null default 'staff',
  created_at timestamptz not null default now()
);

create table if not exists staff_invites (
  email      text primary key,
  role       staff_role not null default 'staff',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_customers_touch on customers;
create trigger trg_customers_touch before update on customers
  for each row execute function touch_updated_at();
drop trigger if exists trg_bookings_touch on bookings;
create trigger trg_bookings_touch before update on bookings
  for each row execute function touch_updated_at();
drop trigger if exists trg_settings_touch on site_settings;
create trigger trg_settings_touch before update on site_settings
  for each row execute function touch_updated_at();

create or replace function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff where user_id = auth.uid());
$$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff where user_id = auth.uid() and role = 'admin');
$$;

-- New auth users become staff if invited; the very first user becomes admin.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_role staff_role;
begin
  if not exists (select 1 from staff) then
    v_role := 'admin';
  else
    select role into v_role from staff_invites where lower(email) = lower(new.email);
  end if;

  if v_role is not null then
    insert into staff (user_id, email, full_name, role)
    values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''), v_role)
    on conflict (user_id) do nothing;
    delete from staff_invites where lower(email) = lower(new.email);
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- Short human-friendly reference, e.g. "TB-7K3QX9"
create or replace function gen_booking_reference() returns text
language plpgsql as $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  ref   text;
begin
  loop
    ref := 'TB-';
    for i in 1..6 loop
      ref := ref || substr(chars, 1 + floor(random() * length(chars))::int, 1);
    end loop;
    exit when not exists (select 1 from bookings where reference = ref);
  end loop;
  return ref;
end $$;

-- ---------------------------------------------------------------------------
-- Availability
-- ---------------------------------------------------------------------------

-- All candidate start times for a date (ignores table occupancy).
create or replace function candidate_slots(p_date date)
returns setof time
language plpgsql stable security definer set search_path = public as $$
declare
  s        site_settings;
  day_key  text;
  hours    jsonb;
  t_open   time;
  t_last   time;
  t        time;
  now_local timestamp;
begin
  select * into s from site_settings where id = 1;
  day_key := lower(to_char(p_date, 'Dy'));
  hours := s.opening_hours -> day_key;

  if hours is null or coalesce((hours->>'closed')::boolean, false) then
    return;
  end if;

  t_open := (hours->>'open')::time;
  t_last := (hours->>'close')::time - make_interval(mins => s.booking_duration_minutes);
  -- guard against a duration longer than the opening window wrapping around midnight
  if (hours->>'close')::time - (hours->>'open')::time < make_interval(mins => s.booking_duration_minutes) then
    return;
  end if;

  now_local := (now() at time zone s.timezone) + make_interval(mins => s.min_notice_minutes);

  t := t_open;
  while t <= t_last loop
    if (p_date + t) >= now_local then
      return next t;
    end if;
    exit when t + make_interval(mins => s.slot_interval_minutes) <= t; -- midnight wrap
    t := t + make_interval(mins => s.slot_interval_minutes);
  end loop;
end $$;

-- Smallest active table that fits the party and is free for the window.
create or replace function find_free_table(
  p_date date, p_start time, p_end time, p_party int, p_exclude_booking uuid default null
) returns uuid
language sql stable security definer set search_path = public as $$
  select t.id
  from restaurant_tables t
  where t.is_active
    and t.capacity >= p_party
    and not exists (
      select 1 from bookings b
      where b.table_id = t.id
        and b.booking_date = p_date
        and b.status in ('pending','confirmed','seated')
        and (p_exclude_booking is null or b.id <> p_exclude_booking)
        and b.start_time < p_end
        and b.end_time > p_start
    )
  order by t.capacity, t.name
  limit 1;
$$;

create or replace function get_available_slots(p_date date, p_party_size int)
returns table (slot time)
language plpgsql stable security definer set search_path = public as $$
declare
  s site_settings;
begin
  select * into s from site_settings where id = 1;
  if not s.booking_enabled
     or p_party_size < 1 or p_party_size > s.max_party_size
     or p_date > (now() at time zone s.timezone)::date + s.booking_window_days then
    return;
  end if;

  return query
    select c.t
    from candidate_slots(p_date) as c(t)
    where find_free_table(p_date, c.t, c.t + make_interval(mins => s.booking_duration_minutes), p_party_size) is not null
    order by c.t;
end $$;

-- ---------------------------------------------------------------------------
-- Booking RPCs
-- ---------------------------------------------------------------------------
create or replace function create_booking(
  p_date date,
  p_time time,
  p_party_size int,
  p_full_name text,
  p_email text,
  p_phone text,
  p_special_requests text default '',
  p_source text default 'website',
  p_table_id uuid default null
) returns json
language plpgsql security definer set search_path = public as $$
declare
  s          site_settings;
  v_staff    boolean := is_staff();
  v_end      time;
  v_table    uuid;
  v_customer uuid;
  v_status   booking_status;
  v_ref      text;
  v_email    text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_phone    text := nullif(trim(coalesce(p_phone, '')), '');
  v_name     text := trim(coalesce(p_full_name, ''));
begin
  select * into s from site_settings where id = 1;

  if length(v_name) < 2 then
    raise exception 'Please enter your name' using errcode = 'P0001';
  end if;
  if not v_staff then
    if not s.booking_enabled then
      raise exception 'Online booking is currently unavailable' using errcode = 'P0001';
    end if;
    if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception 'Please enter a valid email address' using errcode = 'P0001';
    end if;
    if v_phone is null or length(regexp_replace(v_phone, '\D', '', 'g')) < 6 then
      raise exception 'Please enter a valid phone number' using errcode = 'P0001';
    end if;
    if p_party_size < 1 or p_party_size > s.max_party_size then
      raise exception 'Party size must be between 1 and %', s.max_party_size using errcode = 'P0001';
    end if;
    if p_date > (now() at time zone s.timezone)::date + s.booking_window_days then
      raise exception 'Bookings open % days in advance', s.booking_window_days using errcode = 'P0001';
    end if;
    if not exists (select 1 from candidate_slots(p_date) c(t) where c.t = p_time) then
      raise exception 'That time is not available' using errcode = 'P0001';
    end if;
    p_source := 'website';
    p_table_id := null;
  else
    if p_source not in ('website','phone','walk_in','staff') then
      p_source := 'staff';
    end if;
  end if;

  v_end := p_time + make_interval(mins => s.booking_duration_minutes);
  if v_end <= p_time then
    v_end := '23:59:59';
  end if;

  -- serialise bookings per date so two guests can't grab the same table
  perform pg_advisory_xact_lock(hashtext('booking:' || p_date::text));

  if p_table_id is not null then
    if not exists (
         select 1 from restaurant_tables t
         where t.id = p_table_id and t.is_active
           and not exists (
             select 1 from bookings b
             where b.table_id = t.id and b.booking_date = p_date
               and b.status in ('pending','confirmed','seated')
               and b.start_time < v_end and b.end_time > p_time))
    then
      raise exception 'That table is already booked for this time' using errcode = 'P0001';
    end if;
    v_table := p_table_id;
  else
    v_table := find_free_table(p_date, p_time, v_end, p_party_size);
    if v_table is null and not v_staff then
      raise exception 'Sorry, that time has just been taken. Please choose another.' using errcode = 'P0001';
    end if;
  end if;

  -- upsert customer by email, else by phone
  if v_email is not null then
    select id into v_customer from customers where lower(email) = v_email;
  end if;
  if v_customer is null and v_phone is not null then
    select id into v_customer from customers where phone = v_phone order by created_at limit 1;
  end if;

  if v_customer is null then
    insert into customers (full_name, email, phone)
    values (v_name, v_email, v_phone)
    returning id into v_customer;
  else
    update customers
       set full_name = v_name,
           phone = coalesce(v_phone, phone),
           email = coalesce(email, v_email)
     where id = v_customer;
  end if;

  v_status := case
    when p_source = 'walk_in' then 'seated'
    when v_staff or s.auto_confirm then 'confirmed'
    else 'pending'
  end;
  v_ref := gen_booking_reference();

  insert into bookings (reference, customer_id, table_id, booking_date, start_time, end_time,
                        party_size, status, source, special_requests)
  values (v_ref, v_customer, v_table, p_date, p_time, v_end,
          p_party_size, v_status, p_source, coalesce(p_special_requests, ''));

  return json_build_object(
    'reference', v_ref, 'status', v_status, 'date', p_date,
    'time', to_char(p_time, 'HH24:MI'), 'party_size', p_party_size
  );
end $$;

-- Guests look up / cancel their own booking with reference + email.
create or replace function lookup_booking(p_reference text, p_email text)
returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'reference', b.reference, 'status', b.status, 'date', b.booking_date,
    'time', to_char(b.start_time, 'HH24:MI'), 'party_size', b.party_size,
    'full_name', c.full_name, 'special_requests', b.special_requests)
  from bookings b join customers c on c.id = b.customer_id
  where upper(b.reference) = upper(trim(p_reference))
    and lower(c.email) = lower(trim(p_email));
$$;

create or replace function cancel_booking(p_reference text, p_email text)
returns json
language plpgsql security definer set search_path = public as $$
declare
  b bookings;
begin
  select b2.* into b
  from bookings b2 join customers c on c.id = b2.customer_id
  where upper(b2.reference) = upper(trim(p_reference))
    and lower(c.email) = lower(trim(p_email));

  if b.id is null then
    raise exception 'Booking not found' using errcode = 'P0001';
  end if;
  if b.status not in ('pending','confirmed') then
    raise exception 'This booking can no longer be cancelled online' using errcode = 'P0001';
  end if;

  update bookings set status = 'cancelled' where id = b.id;
  return lookup_booking(p_reference, p_email);
end $$;

-- Staff: reassign the table automatically after changing date/time/size.
create or replace function auto_assign_table(p_booking_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  b bookings;
  v_table uuid;
begin
  if not is_staff() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  select * into b from bookings where id = p_booking_id;
  perform pg_advisory_xact_lock(hashtext('booking:' || b.booking_date::text));
  v_table := find_free_table(b.booking_date, b.start_time, b.end_time, b.party_size, b.id);
  update bookings set table_id = v_table where id = b.id;
  return v_table;
end $$;

-- ---------------------------------------------------------------------------
-- CRM view
-- ---------------------------------------------------------------------------
create or replace view customer_stats with (security_invoker = true) as
select
  c.*,
  count(b.id)                                                    as total_bookings,
  count(b.id) filter (where b.status = 'completed')              as visits,
  count(b.id) filter (where b.status = 'no_show')                as no_shows,
  count(b.id) filter (where b.status = 'cancelled')              as cancellations,
  max(b.booking_date) filter (where b.status in ('completed','seated')) as last_visit,
  min(b.booking_date) filter (where b.status in ('pending','confirmed')
                              and b.booking_date >= current_date) as next_booking
from customers c
left join bookings b on b.customer_id = c.id
group by c.id;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table site_settings     enable row level security;
alter table menu_items        enable row level security;
alter table restaurant_tables enable row level security;
alter table customers         enable row level security;
alter table bookings          enable row level security;
alter table staff             enable row level security;
alter table staff_invites     enable row level security;

drop policy if exists "settings public read"  on site_settings;
drop policy if exists "settings staff update" on site_settings;
create policy "settings public read"  on site_settings for select using (true);
create policy "settings staff update" on site_settings for update using (is_staff()) with check (is_staff());

drop policy if exists "menu public read" on menu_items;
drop policy if exists "menu staff all"   on menu_items;
create policy "menu public read" on menu_items for select using (is_active or is_staff());
create policy "menu staff all"   on menu_items for all using (is_staff()) with check (is_staff());

drop policy if exists "tables staff all" on restaurant_tables;
create policy "tables staff all" on restaurant_tables for all using (is_staff()) with check (is_staff());

drop policy if exists "customers staff all" on customers;
create policy "customers staff all" on customers for all using (is_staff()) with check (is_staff());

drop policy if exists "bookings staff all" on bookings;
create policy "bookings staff all" on bookings for all using (is_staff()) with check (is_staff());

drop policy if exists "staff read"         on staff;
drop policy if exists "staff admin manage" on staff;
create policy "staff read"         on staff for select using (is_staff());
create policy "staff admin manage" on staff for all using (is_admin()) with check (is_admin());

drop policy if exists "invites admin" on staff_invites;
create policy "invites admin" on staff_invites for all using (is_admin()) with check (is_admin());

-- Function grants: internal helpers are not callable by the public.
revoke execute on function candidate_slots(date)                          from public, anon;
revoke execute on function find_free_table(date, time, time, int, uuid)   from public, anon;
revoke execute on function gen_booking_reference()                         from public, anon;
revoke execute on function handle_new_user()                               from public, anon, authenticated;
grant  execute on function get_available_slots(date, int) to anon, authenticated;
grant  execute on function create_booking(date, time, int, text, text, text, text, text, uuid) to anon, authenticated;
grant  execute on function lookup_booking(text, text) to anon, authenticated;
grant  execute on function cancel_booking(text, text) to anon, authenticated;
grant  execute on function auto_assign_table(uuid)    to authenticated;

-- Live updates in the CRM
do $$ begin
  alter publication supabase_realtime add table bookings;
exception when duplicate_object then null; when undefined_object then null; end $$;
