const express = require("express");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const app = express();
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

app.post("/api/add-employee", async (req, res) => {
  try {
    console.log("Request body:", req.body);
    const { email, full_name, role, leave_quota, shift_start } = req.body;
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
    });
    if (error) {
      console.error("Supabase Auth Error:", error);
      return res.status(400).json({ error: error.message });
    }
    const { error: dbError } = await supabase
      .from("employees")
      .insert([
        { id: data.user.id, email, full_name, role, leave_quota, shift_start },
      ]);
    if (dbError) {
      console.error("Supabase DB Error:", dbError);
      return res.status(400).json({ error: dbError.message });
    }
    res.status(200).json({ message: "Employee added and invited!" });
  } catch (err) {
    console.error("API error:", err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
