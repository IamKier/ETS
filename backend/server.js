// ETS backend.
//
// Almost everything the app does goes straight to Supabase under RLS. This
// server exists for the one operation that cannot: creating an employee
// needs the Auth admin API, which needs the service role key, which must
// never reach a browser.
//
//   npm start          (from backend/)
const crypto = require("crypto");
const express = require("express");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: require("path").join(__dirname, ".env") });

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
const PORT = Number(process.env.PORT) || 4000;

// Fail at boot, not on the first request. Starting without these produces a
// server that looks healthy and then 500s the moment HR adds someone.
const missing = [
  !SUPABASE_URL && "SUPABASE_URL",
  !SUPABASE_SERVICE_ROLE_KEY && "SUPABASE_SERVICE_ROLE_KEY",
].filter(Boolean);

if (missing.length) {
  console.error(
    `\nCannot start: ${missing.join(" and ")} missing from backend/.env.\n` +
      `Copy backend/.env.example and fill in from the Supabase dashboard\n` +
      `(Settings -> API). The service role key is the secret one.\n`,
  );
  process.exit(1);
}

if (!SUPABASE_SERVICE_ROLE_KEY.startsWith("sb_secret_") &&
    !SUPABASE_SERVICE_ROLE_KEY.startsWith("eyJ")) {
  console.error(
    "\nSUPABASE_SERVICE_ROLE_KEY does not look like a service role key.\n" +
      "The publishable/anon key will not work here — it cannot create users.\n",
  );
  process.exit(1);
}

const app = express();
app.use(express.json());

// Vite picks the next free port when 5173 is taken, so pinning a single
// origin means CORS breaks the moment someone has another dev server
// running. Any localhost port is allowed off-production; anything else has
// to be named explicitly.
const ALLOWED = (process.env.FRONTEND_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const isProduction = process.env.NODE_ENV === "production";

function allowedOrigin(origin) {
  if (!origin) return null;
  if (ALLOWED.includes(origin)) return origin;
  if (!isProduction && /^http:\/\/localhost:\d+$/.test(origin)) return origin;
  return null;
}

app.use((req, res, next) => {
  const origin = allowedOrigin(req.headers.origin);
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Vary", "Origin");
  }
  if (req.method === "OPTIONS") return res.sendStatus(origin ? 204 : 403);
  next();
});

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const ROLES = ["employee", "hr", "admin"];

// Readable but high-entropy: ~62 bits, enough for a credential that is
// meant to be replaced on first sign-in.
function tempPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.randomBytes(12);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

// This process holds the service role key, which bypasses row level
// security entirely. Anyone who can reach the port could otherwise mint
// themselves an admin, so every request must prove it comes from an HR or
// admin user.
async function requireHR(req, res) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "Missing bearer token." });
    return null;
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);
  if (error || !user) {
    res.status(401).json({ error: "Invalid or expired session." });
    return null;
  }

  const { data: caller } = await supabase
    .from("employees")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!caller || (caller.role !== "hr" && caller.role !== "admin")) {
    res.status(403).json({ error: "Only HR or admin can add employees." });
    return null;
  }
  return user;
}

// Lets the frontend and the dev tooling tell "server is down" apart from
// "server is up and rejecting me", which are very different bugs.
app.get("/health", async (_req, res) => {
  const { error } = await supabase.from("employees").select("id").limit(1);
  res.status(error ? 503 : 200).json({
    ok: !error,
    supabase: error ? error.message : "reachable",
    origins: isProduction ? ALLOWED : [...ALLOWED, "http://localhost:*"],
  });
});

app.post("/api/add-employee", async (req, res) => {
  try {
    if (!(await requireHR(req, res))) return;

    const { email, full_name, role, leave_quota, shift_start } = req.body || {};

    if (!email || !full_name) {
      return res.status(400).json({ error: "Email and full name are required." });
    }
    if (role && !ROLES.includes(role)) {
      return res.status(400).json({ error: `Role must be one of ${ROLES.join(", ")}.` });
    }
    if (leave_quota != null && (!Number.isInteger(leave_quota) || leave_quota < 0)) {
      return res.status(400).json({ error: "Leave quota must be a whole number of days." });
    }

    const password = tempPassword();

    // email_confirm skips the verification step; the account is usable
    // immediately with the temporary password below. user_metadata.role is
    // what is_hr() and the HR read policies check, so it has to be set
    // here — a role only written to the employees row would not grant it.
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, role: role || "employee" },
    });

    if (error) {
      console.error("Supabase Auth error:", error.message);
      return res.status(400).json({ error: error.message });
    }

    const { error: dbError } = await supabase.from("employees").insert([
      {
        id: data.user.id,
        email,
        full_name,
        role: role || "employee",
        leave_quota: leave_quota ?? 20,
        shift_start: shift_start || "09:00:00",
      },
    ]);

    if (dbError) {
      // Otherwise the auth user survives without a profile row and the
      // email can never be added again — createUser would reject it as a
      // duplicate while nothing in the app can see it.
      await supabase.auth.admin.deleteUser(data.user.id);
      console.error("Supabase DB error:", dbError.message);
      return res.status(400).json({ error: dbError.message });
    }

    res.status(200).json({
      message: `${full_name} added.`,
      email,
      tempPassword: password,
    });
  } catch (err) {
    console.error("API error:", err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

app.use((req, res) => res.status(404).json({ error: `No route ${req.method} ${req.path}.` }));

const server = app.listen(PORT, () => {
  console.log(`ETS API on http://localhost:${PORT}`);
  console.log(`  project  ${SUPABASE_URL}`);
  console.log(
    `  origins  ${isProduction ? ALLOWED.join(", ") || "(none configured)" : "any http://localhost:<port>"}`,
  );
});

// Without this the process dies with an unhandled rejection stack that says
// nothing about the port already being in use.
server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `\nPort ${PORT} is already in use. Set PORT in backend/.env or stop the other process.\n`,
    );
    process.exit(1);
  }
  throw err;
});
