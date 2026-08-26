-- ETS — Schedule: shifts, rest days and holidays
--
-- Run after schema.sql and employee-requests.sql
-- (Dashboard → SQL Editor → New query). Safe to re-run.
--
-- This replaces three assumptions the app had baked in:
--   * everyone starts at employees.shift_start, with no end and no break
--   * Saturday and Sunday are the rest days, for everyone, always
--   * a 15 minute grace period, hardcoded in the clock-in button and
--     absent entirely from the certificate-of-attendance path

-- ---------------------------------------------------------------
-- shifts
--   end_time before start_time means the shift crosses midnight. That is
--   a night shift, not a data error, and the duration helper below is
--   what every other place should ask rather than subtracting the two.
-- ---------------------------------------------------------------
create table if not exists public.shifts (
  id            bigint generated always as identity primary key,
  name          text not null unique,
  start_time    time not null,
  end_time      time not null,
  break_minutes integer not null default 60 check (break_minutes >= 0),
  -- Minutes after start_time before a clock-in counts as late. Lived in
  -- the frontend as a constant, which meant the database disagreed with
  -- the button about who was late.
  grace_minutes integer not null default 15 check (grace_minutes >= 0),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  check (start_time <> end_time)
);

insert into public.shifts (name, start_time, end_time, break_minutes, grace_minutes)
values
  ('Morning', '08:00', '17:00', 60, 15),
  ('Regular', '09:00', '18:00', 60, 15),
  ('Mid',     '12:00', '21:00', 60, 15),
  ('Night',   '22:00', '06:00', 60, 15)
on conflict (name) do nothing;

-- Paid minutes in a shift, break excluded, wrapping past midnight.
create or replace function public.shift_minutes(p_shift public.shifts)
returns integer
language sql
immutable
as $$
  select greatest(
    0,
    (extract(epoch from (
      case when p_shift.end_time > p_shift.start_time
           then p_shift.end_time - p_shift.start_time
           else p_shift.end_time - p_shift.start_time + interval '24 hours'
      end
    )) / 60)::integer - p_shift.break_minutes
  );
$$;

-- ---------------------------------------------------------------
-- holidays
--   One row per actual date. Deliberately not a recurrence rule: in the
--   Philippines most holidays move, and the ones that do not are still
--   re-proclaimed each year, sometimes shifted for long weekends. An
--   explicit list is the only thing that stays honest.
-- ---------------------------------------------------------------
create table if not exists public.holidays (
  id         bigint generated always as identity primary key,
  date       date not null unique,
  name       text not null,
  -- 'regular' and 'special' differ in pay treatment, which payroll cares
  -- about. For attendance both simply mean "not expected to work".
  type       text not null default 'regular'
               check (type in ('regular', 'special')),
  created_at timestamptz not null default now()
);

create index if not exists holidays_date_idx on public.holidays (date);

-- Indicative 2026 list. CONFIRM AGAINST THE OFFICIAL PROCLAMATION before
-- relying on it: movable holidays shift, Eid dates follow lunar sighting
-- and are not included here at all, and additional special days are
-- proclaimed through the year.
insert into public.holidays (date, name, type) values
  ('2026-01-01', 'New Year''s Day',            'regular'),
  ('2026-04-02', 'Maundy Thursday',            'regular'),
  ('2026-04-03', 'Good Friday',                'regular'),
  ('2026-04-04', 'Black Saturday',             'special'),
  ('2026-04-09', 'Araw ng Kagitingan',         'regular'),
  ('2026-05-01', 'Labor Day',                  'regular'),
  ('2026-06-12', 'Independence Day',           'regular'),
  ('2026-08-21', 'Ninoy Aquino Day',           'special'),
  ('2026-08-31', 'National Heroes Day',        'regular'),
  ('2026-11-01', 'All Saints'' Day',            'special'),
  ('2026-11-30', 'Bonifacio Day',              'regular'),
  ('2026-12-08', 'Immaculate Conception',      'special'),
  ('2026-12-25', 'Christmas Day',              'regular'),
  ('2026-12-30', 'Rizal Day',                  'regular'),
  ('2026-12-31', 'New Year''s Eve',            'special')
on conflict (date) do nothing;

-- ---------------------------------------------------------------
-- employees: shift assignment and rest days
--   rest_days holds JavaScript getDay() numbers (0 = Sunday) so the
--   frontend can test membership without a mapping layer that would
--   eventually be applied in one place and forgotten in another.
-- ---------------------------------------------------------------
alter table public.employees
  add column if not exists shift_id  bigint references public.shifts (id) on delete set null,
  add column if not exists rest_days smallint[] not null default '{0,6}';

alter table public.employees drop constraint if exists employees_rest_days_valid;
alter table public.employees add constraint employees_rest_days_valid
  check (
    rest_days <@ array[0,1,2,3,4,5,6]::smallint[]
    -- Seven rest days is not a schedule, it is a termination.
    and array_length(rest_days, 1) is distinct from 7
  );

-- Backfill: give everyone the shift matching the start time they already
-- had, creating one if no template matches, so nobody is left unassigned
-- and the old shift_start column stops being consulted.
insert into public.shifts (name, start_time, end_time, break_minutes, grace_minutes)
select
  'Shift ' || to_char(e.shift_start, 'HH24:MI'),
  e.shift_start,
  (e.shift_start + interval '9 hours')::time,
  60,
  15
from public.employees e
where e.shift_id is null
  and not exists (select 1 from public.shifts s where s.start_time = e.shift_start)
group by e.shift_start
on conflict (name) do nothing;

update public.employees e
   set shift_id = s.id
  from public.shifts s
 where e.shift_id is null
   and s.start_time = e.shift_start;

-- ---------------------------------------------------------------
-- Working-day test, shared by anything server-side that needs it.
-- ---------------------------------------------------------------
create or replace function public.is_working_day(p_employee uuid, p_date date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    not (extract(dow from p_date)::smallint = any(
      coalesce((select rest_days from public.employees where id = p_employee),
               '{0,6}'::smallint[])
    ))
    and not exists (select 1 from public.holidays h where h.date = p_date);
$$;

-- ---------------------------------------------------------------
-- Certificate of attendance, now shift-aware
--   The previous version read employees.shift_start and applied no grace
--   at all, so an approved certificate could mark someone late for a
--   clock-in the button itself would have accepted.
-- ---------------------------------------------------------------
create or replace function public.decide_coa_request(
  p_id      bigint,
  p_approve boolean,
  p_note    text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c         public.coa_requests;
  shift_beg time;
  grace     integer;
  late_mins integer;
begin
  if not public.is_hr() then
    raise exception 'Only HR or admin can decide a certificate of attendance.';
  end if;

  select * into c from public.coa_requests
   where id = p_id and status = 'pending' for update;

  if not found then
    raise exception 'No pending certificate with id %.', p_id;
  end if;

  if p_approve then
    -- The assigned shift is authoritative; shift_start is only a fallback
    -- for a row the backfill above could not match.
    select coalesce(s.start_time, e.shift_start), coalesce(s.grace_minutes, 0)
      into shift_beg, grace
      from public.employees e
      left join public.shifts s on s.id = e.shift_id
     where e.id = c.user_id;

    late_mins := greatest(0, (extract(epoch from (
      c.requested_clock_in
        - (date_trunc('day', c.requested_clock_in) + shift_beg)
    ))::integer / 60) - grace);

    if c.attendance_id is null then
      insert into public.attendance
        (user_id, clock_in, clock_out, is_late, late_minutes, status)
      values
        (c.user_id, c.requested_clock_in, c.requested_clock_out,
         late_mins > 0, late_mins,
         case when late_mins > 0 then 'late' else 'on-time' end);
    else
      update public.attendance
         set clock_in     = c.requested_clock_in,
             clock_out    = c.requested_clock_out,
             is_late      = late_mins > 0,
             late_minutes = late_mins,
             status       = case when late_mins > 0 then 'late' else 'on-time' end
       where id = c.attendance_id;
    end if;
  end if;

  update public.coa_requests
     set status       = case when p_approve then 'approved' else 'rejected' end,
         decided_by   = auth.uid(),
         decided_at   = now(),
         decided_note = p_note
   where id = p_id;
end $$;

revoke all on function public.decide_coa_request(bigint, boolean, text) from public, anon;
grant execute on function public.decide_coa_request(bigint, boolean, text) to authenticated;

-- ---------------------------------------------------------------
-- Row Level Security
--   Shifts and holidays are reference data: everyone signed in reads
--   them, only HR changes them. Without the read, an employee cannot see
--   their own schedule or know which days are holidays.
-- ---------------------------------------------------------------
alter table public.shifts   enable row level security;
alter table public.holidays enable row level security;

drop policy if exists "read shifts" on public.shifts;
create policy "read shifts" on public.shifts for select
  to authenticated using (true);

drop policy if exists "hr writes shifts" on public.shifts;
create policy "hr writes shifts" on public.shifts for all
  to authenticated using (public.is_hr()) with check (public.is_hr());

drop policy if exists "read holidays" on public.holidays;
create policy "read holidays" on public.holidays for select
  to authenticated using (true);

drop policy if exists "hr writes holidays" on public.holidays;
create policy "hr writes holidays" on public.holidays for all
  to authenticated using (public.is_hr()) with check (public.is_hr());

-- HR needs to be able to assign a shift and set rest days, which is an
-- update to somebody else's employees row. The existing policies only let
-- an employee update their own.
drop policy if exists "hr updates employees" on public.employees;
create policy "hr updates employees" on public.employees for update
  to authenticated using (public.is_hr()) with check (public.is_hr());

-- ---------------------------------------------------------------
-- Protecting the columns an employee must not set on themselves
--
--   The "update own profile" policy in schema.sql grants UPDATE on the
--   whole row, and row level security has no column granularity. That let
--   an employee run
--
--       update employees set role = 'hr' where id = auth.uid();
--
--   and it stuck: requireHR() in backend/server.js reads employees.role to
--   decide who may create accounts, so a self-promoted employee could mint
--   users. (RLS itself reads the JWT claim, not this column, so the
--   database policies were never fooled — the API was.)
--
--   Column-level GRANTs cannot fix it either: HR and employees share the
--   `authenticated` role, so revoking a column from one revokes it from
--   both. A trigger is the only place that can tell them apart.
-- ---------------------------------------------------------------
create or replace function public.guard_employee_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_hr() then
    return new;
  end if;

  if new.id         is distinct from old.id
     or new.email       is distinct from old.email
     or new.role        is distinct from old.role
     or new.leave_quota is distinct from old.leave_quota
     or new.shift_id    is distinct from old.shift_id
     or new.rest_days   is distinct from old.rest_days
     or new.shift_start is distinct from old.shift_start
     or new.start_date  is distinct from old.start_date then
    raise exception
      'Only HR can change role, leave quota, schedule or start date.';
  end if;

  return new;
end $$;

drop trigger if exists employees_guard_self_update on public.employees;
create trigger employees_guard_self_update
  before update on public.employees
  for each row execute function public.guard_employee_self_update();
