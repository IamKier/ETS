// Checks the live database against what the app expects, and says exactly
// what is missing. DDL cannot be run from here — PostgREST exposes tables,
// not a SQL console — so this reports rather than repairs.
//
//   node backend/doctor.js
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: require("path").join(__dirname, ".env") });

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in backend/.env.",
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Every table the frontend reads, with the columns it actually selects.
// Probing one row is enough: PostgREST rejects an unknown column by name,
// which is the failure this is looking for.
const EXPECTED = {
  employees:
    "id, email, full_name, role, leave_quota, shift_start, start_date, shift_id, rest_days",
  shifts: "id, name, start_time, end_time, break_minutes, grace_minutes, is_active",
  holidays: "id, date, name, type",
  attendance: "id, user_id, clock_in, clock_out, is_late, late_minutes, status",
  leave_requests:
    "id, user_id, type, start_date, end_date, days, reason, status, decided_by, decided_at, decided_note",
  ob_requests:
    "id, user_id, start_date, end_date, days, destination, purpose, contact, status",
  ot_requests:
    "id, user_id, work_date, planned_start, planned_end, planned_minutes, actual_minutes, reason, status, confirmed_at",
  coa_requests:
    "id, user_id, attendance_id, work_date, requested_clock_in, requested_clock_out, cause, reason, status",
};

// The embeds the approvals queue uses. Each request table has two foreign
// keys to employees, so these named constraints have to exist or PostgREST
// refuses the join as ambiguous.
const EMBEDS = [
  ["leave_requests", "employees!leave_requests_user_id_fkey(full_name)"],
  ["ob_requests", "employees!ob_requests_user_id_fkey(full_name)"],
  ["ot_requests", "employees!ot_requests_user_id_fkey(full_name)"],
  ["coa_requests", "employees!coa_requests_user_id_fkey(full_name)"],
];

const RPCS = ["decide_coa_request"];

(async () => {
  let problems = 0;
  const missingTables = [];

  console.log(`\nChecking ${SUPABASE_URL}\n`);

  console.log("Tables and columns");
  for (const [table, columns] of Object.entries(EXPECTED)) {
    const { error } = await supabase.from(table).select(columns).limit(1);
    if (!error) {
      console.log(`  ok       ${table}`);
      continue;
    }
    problems++;
    // PGRST205 is "table not in the schema cache", i.e. it does not exist.
    if (error.code === "PGRST205" || /does not exist/i.test(error.message)) {
      missingTables.push(table);
      console.log(`  MISSING  ${table}`);
    } else {
      console.log(`  BROKEN   ${table}: ${error.message}`);
    }
  }

  console.log("\nApproval-queue joins");
  for (const [table, embed] of EMBEDS) {
    if (missingTables.includes(table)) {
      console.log(`  skipped  ${table} (table missing)`);
      continue;
    }
    const { error } = await supabase.from(table).select(`id, ${embed}`).limit(1);
    if (error) {
      problems++;
      console.log(`  BROKEN   ${table}: ${error.message}`);
    } else {
      console.log(`  ok       ${table}`);
    }
  }

  console.log("\nFunctions");
  for (const fn of RPCS) {
    // Called with a deliberately absent id. "No pending ..." means the
    // function ran; a missing-function error means it was never created.
    const { error } = await supabase.rpc(fn, {
      p_id: -1,
      p_approve: false,
      p_note: null,
    });
    if (error && /Could not find the function|does not exist/i.test(error.message)) {
      problems++;
      console.log(`  MISSING  ${fn}`);
    } else {
      console.log(`  ok       ${fn}`);
    }
  }

  console.log("\nAccounts");
  const { data: auth, error: authErr } = await supabase.auth.admin.listUsers();
  if (authErr) {
    problems++;
    console.log(`  BROKEN   auth: ${authErr.message}`);
  } else {
    const { data: rows } = await supabase.from("employees").select("email, role");
    console.log(`  ok       ${auth.users.length} auth users`);
    (rows ?? []).forEach((r) => console.log(`           ${r.email} (${r.role})`));
    // An auth user with no employees row can never be read by the app:
    // every page joins on that row.
    const orphans = auth.users.filter(
      (u) => !(rows ?? []).some((r) => r.email === u.email),
    );
    if (orphans.length) {
      problems++;
      console.log(
        `  PROBLEM  ${orphans.length} auth user(s) with no employees row: ${orphans.map((o) => o.email).join(", ")}`,
      );
    }
  }

  if (problems === 0) {
    console.log("\nAll good — the database matches what the app expects.\n");
    process.exit(0);
  }

  console.log(`\n${problems} problem(s).`);
  if (missingTables.length) {
    console.log(
      "\nRun supabase/employee-requests.sql in the Supabase dashboard\n" +
        "(SQL Editor → New query), then run this again.",
    );
  }
  process.exit(1);
})();
