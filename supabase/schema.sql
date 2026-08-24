-- ETS — Employee Timesheet System
-- Schema reconstructed from the queries the app actually makes.
-- Run this in the new project's SQL editor (Dashboard → SQL Editor → New query).

-- ---------------------------------------------------------------
-- employees
--   id matches auth.users.id; the backend creates the auth user first
--   (supabase.auth.admin.createUser) and then inserts this row with the
--   same id, so the FK below enforces that ordering.
-- ---------------------------------------------------------------
create table if not exists public.employees (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null unique,
  full_name   text not null,
  role        text not null default 'employee'
                check (role in ('employee', 'hr', 'admin')),
  leave_quota integer not null default 20 check (leave_quota >= 0),
  shift_start time not null default '09:00:00',
  start_date  date not null default current_date,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- attendance
--   One row per clock-in. clock_out stays null until the employee clocks
--   out — ClockSection and ClockOutButton both find the open row with
--   `.is("clock_out", null)`, so that null is load-bearing.
-- ---------------------------------------------------------------
create table if not exists public.attendance (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references public.employees (id) on delete cascade,
  clock_in     timestamptz not null default now(),
  clock_out    timestamptz,
  is_late      boolean not null default false,
  late_minutes integer not null default 0 check (late_minutes >= 0),
  status       text not null default 'on-time'
                 check (status in ('on-time', 'late')),
  created_at   timestamptz not null default now(),
  check (clock_out is null or clock_out >= clock_in)
);

-- The hot query is "latest open row for this user", plus a month-range
-- scan for the calendar. Both are covered by this.
create index if not exists attendance_user_clock_in_idx
  on public.attendance (user_id, clock_in desc);

-- At most one open clock-in per employee, so a double tap on Clock In
-- cannot strand two open rows.
create unique index if not exists attendance_one_open_per_user_idx
  on public.attendance (user_id)
  where clock_out is null;

-- ---------------------------------------------------------------
-- Row Level Security
--   The frontend ships the publishable (anon) key, so it is public.
--   RLS is what actually stops one employee reading another's hours.
-- ---------------------------------------------------------------
alter table public.employees  enable row level security;
alter table public.attendance enable row level security;

-- Employees: you can read and update your own profile row.
create policy "read own profile"
  on public.employees for select
  using (auth.uid() = id);

create policy "update own profile"
  on public.employees for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- HR and admin can read everyone. Uses a JWT claim rather than a
-- subquery on employees, which would recurse through this same policy.
create policy "hr reads all profiles"
  on public.employees for select
  using (coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') in ('hr', 'admin'));

-- Attendance: you can read, create and close your own records.
create policy "read own attendance"
  on public.attendance for select
  using (auth.uid() = user_id);

create policy "insert own attendance"
  on public.attendance for insert
  with check (auth.uid() = user_id);

create policy "update own attendance"
  on public.attendance for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "hr reads all attendance"
  on public.attendance for select
  using (coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') in ('hr', 'admin'));

-- Note: the add-employee API uses the service role key, which bypasses
-- RLS entirely. That is why it can insert employee rows that no anon
-- policy above would permit.
