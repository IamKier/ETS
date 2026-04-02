import { useState } from "react";

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
    try {
      const response = await fetch("http://localhost:4000/api/add-employee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = await response.json();
      setLoading(false);
      setMessage(result.error || result.message);
      if (!result.error) {
        setForm({
          full_name: "",
          email: "",
          role: "employee",
          leave_quota: 20,
          shift_start: "09:00:00",
        });
      }
    } catch (err) {
      setLoading(false);
      setMessage("An error occurred. Please try again.");
    }
  };

  return (
    <div
      style={{
        maxWidth: 420,
        margin: "3rem auto",
        padding: 32,
        background: "#23242c",
        borderRadius: 16,
        boxShadow: "0 2px 16px rgba(0,0,0,0.10)",
        color: "#fff",
      }}
    >
      <h2
        style={{
          textAlign: "center",
          fontWeight: 700,
          fontSize: "2rem",
          marginBottom: 24,
        }}
      >
        Add New Employee
      </h2>
      <form
        onSubmit={handleSubmit}
        style={{ display: "flex", flexDirection: "column", gap: 16 }}
      >
        <input
          name="full_name"
          value={form.full_name}
          onChange={handleChange}
          placeholder="Full Name"
          required
          style={{
            borderRadius: 8,
            border: "none",
            padding: 14,
            fontSize: "1.1rem",
            background: "#181920",
            color: "#fff",
          }}
        />
        <input
          name="email"
          type="email"
          value={form.email}
          onChange={handleChange}
          placeholder="Email"
          required
          style={{
            borderRadius: 8,
            border: "none",
            padding: 14,
            fontSize: "1.1rem",
            background: "#181920",
            color: "#fff",
          }}
        />
        <select
          name="role"
          value={form.role}
          onChange={handleChange}
          style={{
            borderRadius: 8,
            border: "none",
            padding: 14,
            fontSize: "1.1rem",
            background: "#181920",
            color: "#fff",
          }}
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
          style={{
            borderRadius: 8,
            border: "none",
            padding: 14,
            fontSize: "1.1rem",
            background: "#181920",
            color: "#fff",
          }}
        />
        <input
          name="shift_start"
          type="time"
          value={form.shift_start}
          onChange={handleChange}
          style={{
            borderRadius: 8,
            border: "none",
            padding: 14,
            fontSize: "1.1rem",
            background: "#181920",
            color: "#fff",
          }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{
            borderRadius: 8,
            border: "none",
            padding: 16,
            fontSize: "1.15rem",
            fontWeight: 600,
            background: loading ? "#888" : "#3b82f6",
            color: "#fff",
            cursor: loading ? "not-allowed" : "pointer",
            marginTop: 8,
            transition: "background 0.18s",
          }}
        >
          {loading ? "Adding..." : "Add Employee"}
        </button>
      </form>
      {message && (
        <div
          style={{
            marginTop: 18,
            color: message.includes("error") ? "#ef4444" : "#22c55e",
            textAlign: "center",
            fontWeight: 500,
          }}
        >
          {message}
        </div>
      )}
    </div>
  );
}
