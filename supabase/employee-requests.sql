-- ETS — Employee self-service requests
--   Leave · OB (Official Business) · OT (Overtime) · COA (Certificate of
--   Attendance)
--
-- Run this after schema.sql (Dashboard → SQL Editor → New query).
-- Supersedes leave-and-corrections.sql, which is deleted — run only this.
-- Safe to re-run: every statement is guarded.

create extension if not exists btree_gist;

-- ---------------------------------------------------------------
-- Shared helper
--   Every policy below asks the same question, and the JWT claim is the
--   only place the answer can come from: a subquery on employees would
--   recurse through that table's own read policy.
-- ---------------------------------------------------------------
create or replace function public.is_hr()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') in ('hr', 'admin');
$$;

-- ===============================================================
-- LEAVE
--   days is stored rather than derived. It is the working-day count the
--   request was filed under, and quota arithmetic has to stay stable even
--   if the weekend rules change later.
-- ===============================================================
create table if not exists public.leave_requests (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references public.employees (id) on delete cascade,
  type         text not null default 'vacation'
                 check (type in ('vacation', 'sick', 'unpaid', 'other')),
  start_date   date not null,
  end_date     date not null,
  days         integer not null check (days > 0),
  reason       text,
  status       text not null default 'pending'
                 check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  decided_by   uuid references public.employees (id) on delete set null,
  decided_at   timestamptz,
  decided_note text,
  created_at   timestamptz not null default now(),
  check (end_date >= start_date)
);

create index if not exists leave_requests_user_idx
  on public.leave_requests (user_id, start_date desc);
create index if not exists leave_requests_pending_idx
  on public.leave_requests (status, start_date) where status = 'pending';

alter table public.leave_requests drop constraint if exists leave_requests_no_overlap;
alter table public.leave_requests add constraint leave_requests_no_overlap
  exclude using gist (
    user_id with =,
    daterange(start_date, end_date, '[]') with &&
  ) where (status in ('pending', 'approved'));

-- ===============================================================
-- OB — Official Business
--   An approved OB day counts as a full present day: the employee is
--   working, just not where the clock is. The dashboard credits it the
--   standard day's hours, which is why days is stored the same way leave
--   stores it.
-- ===============================================================
create table if not exists public.ob_requests (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references public.employees (id) on delete cascade,
  start_date   date not null,
  end_date     date not null,
  days         integer not null check (days > 0),
  destination  text not null,
  purpose      text not null,
  contact      text,
  status       text not null default 'pending'
                 check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  decided_by   uuid references public.employees (id) on delete set null,
  decided_at   timestamptz,
  decided_note text,
  created_at   timestamptz not null default now(),
  check (end_date >= start_date)
);

create index if not exists ob_requests_user_idx
  on public.ob_requests (user_id, start_date desc);
create index if not exists ob_requests_pending_idx
  on public.ob_requests (status, start_date) where status = 'pending';

alter table public.ob_requests drop constraint if exists ob_requests_no_overlap;
alter table public.ob_requests add constraint ob_requests_no_overlap
  exclude using gist (
    user_id with =,
    daterange(start_date, end_date, '[]') with &&
  ) where (status in ('pending', 'approved'));

-- ===============================================================
-- OT — Overtime
--   Two phases, because approved hours and rendered hours are different
--   facts and payroll needs both. planned_* is what HR authorised;
--   actual_minutes is what the employee reports afterwards. The variance
--   between them is the whole point of filing twice.
-- ===============================================================
create table if not exists public.ot_requests (
  id              bigint generated always as identity primary key,
  user_id         uuid not null references public.employees (id) on delete cascade,
  work_date       date not null,
  planned_start   timestamptz not null,
  planned_end     timestamptz not null,
  planned_minutes integer not null check (planned_minutes > 0),
  actual_minutes  integer check (actual_minutes >= 0),
  reason          text not null,
  status          text not null default 'pending'
                    check (status in ('pending', 'approved', 'rejected',
                                      'cancelled', 'confirmed')),
  decided_by      uuid references public.employees (id) on delete set null,
  decided_at      timestamptz,
  decided_note    text,
  confirmed_at    timestamptz,
  created_at      timestamptz not null default now(),
  check (planned_end > planned_start),
  -- Actual hours cannot exist before there was an approval to measure
  -- them against.
  check (actual_minutes is null or status = 'confirmed')
);

create index if not exists ot_requests_user_idx
  on public.ot_requests (user_id, work_date desc);
create index if not exists ot_requests_pending_idx
  on public.ot_requests (status, work_date) where status = 'pending';

-- One live OT request per day. Two overlapping claims on the same evening
-- is the failure mode this prevents.
drop index if exists ot_requests_one_per_day;
create unique index if not exists ot_requests_one_per_day
  on public.ot_requests (user_id, work_date)
  where status in ('pending', 'approved', 'confirmed');

-- ===============================================================
-- COA — Certificate of Attendance
--   Filed when the timekeeping record is missing or wrong: forgot to log,
--   biometric down, system outage. attendance_id is nullable because a day
--   that was never logged has no row to amend — approving one of those
--   inserts a row instead.
-- ===============================================================
create table if not exists public.coa_requests (
  id                  bigint generated always as identity primary key,
  user_id             uuid not null references public.employees (id) on delete cascade,
  attendance_id       bigint references public.attendance (id) on delete cascade,
  work_date           date not null,
  requested_clock_in  timestamptz not null,
  requested_clock_out timestamptz,
  cause               text not null default 'forgot'
                        check (cause in ('forgot', 'device', 'outage',
                                         'offsite', 'other')),
  reason              text not null,
  status              text not null default 'pending'
                        check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  decided_by          uuid references public.employees (id) on delete set null,
  decided_at          timestamptz,
  decided_note        text,
  created_at          timestamptz not null default now(),
  check (requested_clock_out is null
         or requested_clock_out >= requested_clock_in)
);

create index if not exists coa_requests_user_idx
  on public.coa_requests (user_id, work_date desc);
create index if not exists coa_requests_pending_idx
  on public.coa_requests (status, created_at) where status = 'pending';

-- ===============================================================
-- Cross-type conflicts
--   Nobody can be on leave and on official business the same day. The
--   per-table exclusion constraints cannot see across tables, so this
--   trigger does. It fires on both, so whichever is filed second loses.
-- ===============================================================
create or replace function public.assert_no_conflicting_absence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  clash text;
begin
  if new.status not in ('pending', 'approved') then
    return new;
  end if;

  if tg_table_name = 'leave_requests' then
    select destination into clash
      from public.ob_requests
     where user_id = new.user_id
       and status in ('pending', 'approved')
       and daterange(start_date, end_date, '[]')
           && daterange(new.start_date, new.end_date, '[]')
     limit 1;
    if found then
      raise exception
        'Those dates overlap an official business filing (%).', clash;
    end if;
  else
    select type into clash
      from public.leave_requests
     where user_id = new.user_id
       and status in ('pending', 'approved')
       and daterange(start_date, end_date, '[]')
           && daterange(new.start_date, new.end_date, '[]')
     limit 1;
    if found then
      raise exception 'Those dates overlap a % leave request.', clash;
    end if;
  end if;

  return new;
end $$;

drop trigger if exists leave_no_conflict on public.leave_requests;
create trigger leave_no_conflict
  before insert or update on public.leave_requests
  for each row execute function public.assert_no_conflicting_absence();

drop trigger if exists ob_no_conflict on public.ob_requests;
create trigger ob_no_conflict
  before insert or update on public.ob_requests
  for each row execute function public.assert_no_conflicting_absence();

-- ===============================================================
-- Leave quota
--   Kept in the database rather than the approve button. The anon key is
--   public and the HR update policy is broad, so a check that only lives
--   in the client is not a check at all. Unpaid leave is outside quota.
-- ===============================================================
create or replace function public.enforce_leave_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  quota integer;
  used  integer;
begin
  if new.status = 'approved'
     and old.status is distinct from 'approved'
     and new.type <> 'unpaid' then

    select leave_quota into quota from public.employees where id = new.user_id;

    select coalesce(sum(days), 0) into used
      from public.leave_requests
     where user_id = new.user_id
       and status = 'approved'
       and type <> 'unpaid'
       and id <> new.id
       and extract(year from start_date) = extract(year from new.start_date);

    if used + new.days > coalesce(quota, 0) then
      raise exception
        'Approving this would take % to % of % leave days for %.',
        (select full_name from public.employees where id = new.user_id),
        used + new.days, coalesce(quota, 0),
        extract(year from new.start_date)::int;
    end if;
  end if;

  if new.status is distinct from old.status
     and new.status in ('approved', 'rejected') then
    new.decided_by := auth.uid();
    new.decided_at := now();
  end if;

  return new;
end $$;

drop trigger if exists leave_requests_quota on public.leave_requests;
create trigger leave_requests_quota
  before update on public.leave_requests
  for each row execute function public.enforce_leave_quota();

-- Same decision stamping for OB, which has no quota to check.
create or replace function public.stamp_decision()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status
     and new.status in ('approved', 'rejected') then
    new.decided_by := auth.uid();
    new.decided_at := now();
  end if;
  return new;
end $$;

drop trigger if exists ob_requests_stamp on public.ob_requests;
create trigger ob_requests_stamp
  before update on public.ob_requests
  for each row execute function public.stamp_decision();

-- ===============================================================
-- OT status transitions
--   RLS cannot express this. Permissive policies OR together, and their
--   USING (old row) and WITH CHECK (new row) halves are evaluated
--   independently — so a "cancel while pending" policy and a "confirm
--   while approved" policy would between them permit pending -> confirmed.
--   A trigger is the only place that sees both rows at once.
-- ===============================================================
create or replace function public.guard_ot_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  if public.is_hr() and old.status = 'pending'
     and new.status in ('approved', 'rejected') then
    new.decided_by := auth.uid();
    new.decided_at := now();
    return new;
  end if;

  if auth.uid() = old.user_id then
    if old.status = 'pending' and new.status = 'cancelled' then
      return new;
    end if;
    -- Confirming is what closes an OT out. Hours are mandatory here
    -- precisely because the row is worthless to payroll without them.
    if old.status = 'approved' and new.status = 'confirmed'
       and new.actual_minutes is not null then
      new.confirmed_at := now();
      return new;
    end if;
  end if;

  raise exception 'Not a permitted change: % -> %.', old.status, new.status;
end $$;

drop trigger if exists ot_requests_transition on public.ot_requests;
create trigger ot_requests_transition
  before update on public.ot_requests
  for each row execute function public.guard_ot_transition();

-- ===============================================================
-- Applying an approved COA
--   HR has no update policy on other people's attendance rows and should
--   not get one — it would let HR rewrite any timesheet directly. This is
--   the only path, it runs as definer, and it re-derives lateness from the
--   employee's own shift_start so a certified clock-in cannot keep a stale
--   "late" flag.
-- ===============================================================
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
  shift     time;
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
    select shift_start into shift from public.employees where id = c.user_id;

    -- Minutes past shift start on the certified date. Early collapses to
    -- zero rather than crediting time.
    late_mins := greatest(0, extract(epoch from (
      c.requested_clock_in - (date_trunc('day', c.requested_clock_in) + shift)
    ))::integer / 60);

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

-- ===============================================================
-- Row Level Security
--   Same three-part shape on every table: read your own, file your own,
--   withdraw your own while pending. HR reads all and decides.
-- ===============================================================
alter table public.leave_requests enable row level security;
alter table public.ob_requests    enable row level security;
alter table public.ot_requests    enable row level security;
alter table public.coa_requests   enable row level security;

-- ---- leave ----
drop policy if exists "read own leave" on public.leave_requests;
create policy "read own leave" on public.leave_requests for select
  using (auth.uid() = user_id);

drop policy if exists "file own leave" on public.leave_requests;
create policy "file own leave" on public.leave_requests for insert
  with check (auth.uid() = user_id and status = 'pending');

-- The with-check is what stops self-approval: an employee may move their
-- own row to 'cancelled' and nowhere else.
drop policy if exists "cancel own leave" on public.leave_requests;
create policy "cancel own leave" on public.leave_requests for update
  using (auth.uid() = user_id and status = 'pending')
  with check (auth.uid() = user_id and status = 'cancelled');

drop policy if exists "hr reads all leave" on public.leave_requests;
create policy "hr reads all leave" on public.leave_requests for select
  using (public.is_hr());

drop policy if exists "hr decides leave" on public.leave_requests;
create policy "hr decides leave" on public.leave_requests for update
  using (public.is_hr()) with check (public.is_hr());

-- ---- OB ----
drop policy if exists "read own ob" on public.ob_requests;
create policy "read own ob" on public.ob_requests for select
  using (auth.uid() = user_id);

drop policy if exists "file own ob" on public.ob_requests;
create policy "file own ob" on public.ob_requests for insert
  with check (auth.uid() = user_id and status = 'pending');

drop policy if exists "cancel own ob" on public.ob_requests;
create policy "cancel own ob" on public.ob_requests for update
  using (auth.uid() = user_id and status = 'pending')
  with check (auth.uid() = user_id and status = 'cancelled');

drop policy if exists "hr reads all ob" on public.ob_requests;
create policy "hr reads all ob" on public.ob_requests for select
  using (public.is_hr());

drop policy if exists "hr decides ob" on public.ob_requests;
create policy "hr decides ob" on public.ob_requests for update
  using (public.is_hr()) with check (public.is_hr());

-- ---- OT ----
-- Both employee and HR updates run through one broad policy here; the
-- transition trigger above is what actually constrains them, because it
-- is the only thing that can compare the old row to the new one.
drop policy if exists "read own ot" on public.ot_requests;
create policy "read own ot" on public.ot_requests for select
  using (auth.uid() = user_id);

drop policy if exists "file own ot" on public.ot_requests;
create policy "file own ot" on public.ot_requests for insert
  with check (auth.uid() = user_id and status = 'pending'
              and actual_minutes is null);

drop policy if exists "update own ot" on public.ot_requests;
create policy "update own ot" on public.ot_requests for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "hr reads all ot" on public.ot_requests;
create policy "hr reads all ot" on public.ot_requests for select
  using (public.is_hr());

drop policy if exists "hr decides ot" on public.ot_requests;
create policy "hr decides ot" on public.ot_requests for update
  using (public.is_hr()) with check (public.is_hr());

-- ---- COA ----
-- No HR update policy at all: deciding one goes through
-- decide_coa_request() so the attendance row and the certificate can
-- never disagree.
drop policy if exists "read own coa" on public.coa_requests;
create policy "read own coa" on public.coa_requests for select
  using (auth.uid() = user_id);

drop policy if exists "file own coa" on public.coa_requests;
create policy "file own coa" on public.coa_requests for insert
  with check (auth.uid() = user_id and status = 'pending');

drop policy if exists "cancel own coa" on public.coa_requests;
create policy "cancel own coa" on public.coa_requests for update
  using (auth.uid() = user_id and status = 'pending')
  with check (auth.uid() = user_id and status = 'cancelled');

drop policy if exists "hr reads all coa" on public.coa_requests;
create policy "hr reads all coa" on public.coa_requests for select
  using (public.is_hr());
