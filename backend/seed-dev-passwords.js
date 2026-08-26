// Sets one shared password on the @ets-demo.com accounts so the dev account
// picker on the login screen can sign in without anyone typing a credential.
//
//   node backend/seed-dev-passwords.js
//
// The password must match VITE_DEV_PASSWORD in frontend/.env. Both files are
// gitignored, and the guard below refuses to touch any address outside the
// demo domain, so this cannot reset a real user by accident.
const { createClient } = require("@supabase/supabase-js");
// Resolved against this file, not the cwd, so the script runs the same from
// the repo root or from backend/.
require("dotenv").config({ path: require("path").join(__dirname, ".env") });

const DEMO_DOMAIN = "@ets-demo.com";
const password = process.env.DEV_PASSWORD;

if (!password) {
  console.error(
    "Set DEV_PASSWORD in backend/.env first, matching VITE_DEV_PASSWORD in frontend/.env.",
  );
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

(async () => {
  const { data, error } = await supabase.auth.admin.listUsers();
  if (error) {
    console.error("Could not list users:", error.message);
    process.exit(1);
  }

  const demo = data.users.filter((u) => u.email?.endsWith(DEMO_DOMAIN));
  if (!demo.length) {
    console.error(`No ${DEMO_DOMAIN} accounts found — nothing to do.`);
    process.exit(1);
  }

  let failed = 0;
  for (const user of demo) {
    const { error: err } = await supabase.auth.admin.updateUserById(user.id, {
      password,
    });
    if (err) failed++;
    console.log(err ? `  failed  ${user.email}: ${err.message}` : `  set     ${user.email}`);
  }

  console.log(
    failed
      ? `\n${demo.length - failed} of ${demo.length} updated, ${failed} failed.`
      : `\n${demo.length} demo accounts now share the dev password.`,
  );
  process.exit(failed ? 1 : 0);
})();
