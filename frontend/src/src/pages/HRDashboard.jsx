import { useState } from "react";
import { LoaderCircle, UserPlus } from "lucide-react";

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
  const [notice, setNotice] = useState(null);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setNotice(null);
    try {
      const response = await fetch("http://localhost:4000/api/add-employee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = await response.json();
      setLoading(false);
      if (result.error) {
        setNotice({ type: "error", text: result.error });
      } else {
        setNotice({ type: "success", text: result.message });
        setForm(EMPTY_FORM);
      }
    } catch {
      setLoading(false);
      setNotice({
        type: "error",
        text: "Could not reach the employee service. Is the backend running on port 4000?",
      });
    }
  };

  return (
    <div className="page page-narrow">
      <header className="page-head">
        <h1>Team</h1>
        <p className="page-sub">Add an employee to the timesheet system</p>
      </header>

      <div className="card card-pad">
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

          <div className="field-pair">
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
              <label htmlFor="leave_quota">Leave quota</label>
              <input
                id="leave_quota"
                name="leave_quota"
                type="number"
                value={form.leave_quota}
                onChange={handleChange}
                min={0}
              />
            </div>
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
            <p className="field-hint">
              Clock-ins more than 15 minutes after this count as late.
            </p>
          </div>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <UserPlus size={16} />
            )}
            {loading ? "Adding..." : "Add employee"}
          </button>
        </form>

        {notice && (
          <div className={`form-message ${notice.type}`} role="alert">
            {notice.text}
          </div>
        )}
      </div>
    </div>
  );
}
