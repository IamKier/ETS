import { useState } from "react";

const EMPTY_FORM = {
  full_name: "",
  email: "",
  role: "employee",
  leave_quota: 20,
  shift_start: "09:00:00",
};

export default function HRDashboard() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

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
      setIsError(Boolean(result.error));
      setMessage(result.error || result.message);
      if (!result.error) setForm(EMPTY_FORM);
    } catch {
      setLoading(false);
      setIsError(true);
      setMessage("An error occurred. Please try again.");
    }
  };

  return (
    <div className="panel">
      <h2>Add New Employee</h2>
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="full_name">Full name</label>
          <input
            id="full_name"
            name="full_name"
            value={form.full_name}
            onChange={handleChange}
            placeholder="Jane Dela Cruz"
            required
          />
        </div>

        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            value={form.email}
            onChange={handleChange}
            placeholder="jane@company.com"
            required
          />
        </div>

        <div className="field">
          <label htmlFor="role">Role</label>
          <select
            id="role"
            name="role"
            value={form.role}
            onChange={handleChange}
          >
            <option value="employee">Employee</option>
            <option value="hr">HR</option>
            <option value="admin">Admin</option>
          </select>
        </div>

        <div className="field">
          <label htmlFor="leave_quota">Leave quota (days)</label>
          <input
            id="leave_quota"
            name="leave_quota"
            type="number"
            value={form.leave_quota}
            onChange={handleChange}
            min={0}
          />
        </div>

        <div className="field">
          <label htmlFor="shift_start">Shift start</label>
          <input
            id="shift_start"
            name="shift_start"
            type="time"
            value={form.shift_start}
            onChange={handleChange}
          />
        </div>

        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? "Adding..." : "Add Employee"}
        </button>
      </form>

      {message && (
        <div className={`form-message ${isError ? "error" : "success"}`}>
          {message}
        </div>
      )}
    </div>
  );
}
