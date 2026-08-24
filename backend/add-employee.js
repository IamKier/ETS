const crypto = require("crypto");
const express = require("express");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const app = express();
app.use(express.json());

const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:5173";

// Set by hand rather than pulling in the `cors` package — this is the only
// endpoint and it only ever answers one origin. Without these headers the
// browser blocks the response even when the request itself succeeds.
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", FRONTEND_ORIGIN);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

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
// themselves an admin, so every request must prove it comes from an
// HR or admin user.
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

    const password = tempPassword();

    // email_confirm skips the verification step; the account is usable
    // immediately with the temporary password below. user_metadata.role is
    // what the HR read policies in schema.sql check, so it has to be set
    // here — a role only written to the employees row would not grant it.
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, role: role || "employee" },
    });

    if (error) {
      console.error("Supabase Auth error:", error);
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
      console.error("Supabase DB error:", dbError);
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

const PORT = process.env.PORT || 4000;
app.listen(PORT, () =>
  console.log(
    `ETS employee API on http://localhost:${PORT} (allowing ${FRONTEND_ORIGIN})`,
  ),
);
