import { useState } from "react";
import { supabase } from "../../supabaseClient";

export default function HRDashboard() {
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    role: "employee",
    leave_quota: 20,
    shift_start: "09:00:00",
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    // Invite user via Supabase Auth
    const { data, error } = await supabase.auth.admin.createUser({
      email: form.email,
      email_confirm: true,
    });
    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }
    // Insert into profiles
    const { error: profileError } = await supabase.from("profiles").insert([
      {
        id: data.user.id,
        full_name: form.full_name,
        role: form.role,
        leave_quota: form.leave_quota,
        shift_start: form.shift_start,
      },
    ]);
    setLoading(false);
    if (profileError) setMessage(profileError.message);
    else setMessage("Employee added and invited!");
    setForm({
      full_name: "",
      email: "",
      role: "employee",
      leave_quota: 20,
      shift_start: "09:00:00",
    });
  };

  return (
    <div
      style={{
        maxWidth: 400,
        margin: "2rem auto",
        padding: 24,
        background: "#fff",
        borderRadius: 8,
      }}
    >
      <h2>Add New Employee</h2>
      <form onSubmit={handleSubmit}>
        <input
          name="full_name"
          value={form.full_name}
          onChange={handleChange}
          placeholder="Full Name"
          required
          style={{ width: "100%", marginBottom: 8, padding: 8 }}
        />
        <input
          name="email"
          type="email"
          value={form.email}
          onChange={handleChange}
          placeholder="Email"
          required
          style={{ width: "100%", marginBottom: 8, padding: 8 }}
        />
        <select
          name="role"
          value={form.role}
          onChange={handleChange}
          style={{ width: "100%", marginBottom: 8, padding: 8 }}
        >
          <option value="employee">Employee</option>
          <option value="hr">HR</option>
          <option value="admin">Admin</option>
        </select>
        <input
          name="leave_quota"
          type="number"
          value={form.leave_quota}
          onChange={handleChange}
          placeholder="Leave Quota"
          min={0}
          style={{ width: "100%", marginBottom: 8, padding: 8 }}
        />
        <input
          name="shift_start"
          type="time"
          value={form.shift_start}
          onChange={handleChange}
          style={{ width: "100%", marginBottom: 8, padding: 8 }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{ width: "100%", padding: 10 }}
        >
          {loading ? "Adding..." : "Add Employee"}
        </button>
      </form>
      {message && <div style={{ marginTop: 12, color: "#333" }}>{message}</div>}
    </div>
  );
}
