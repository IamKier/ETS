import { useEffect, useState } from "react";
import { supabase } from "../../supabaseClient";

export default function UserInfo() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const getUserAndProfile = async () => {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUser(user);
      if (user) {
        const { data: profile } = await supabase
          .from("employees")
          .select("full_name, role, leave_quota, shift_start")
          .eq("id", user.id)
          .single();
        setProfile(profile);
      }
      setLoading(false);
    };
    getUserAndProfile();
  }, []);

  if (loading) return <div className="user-info-card">Loading user info...</div>;
  if (!user)
    return (
      <div className="user-info-card">Please log in to view your dashboard.</div>
    );

  const rows = [
    ["Name", profile?.full_name || user.email],
    ["Email", user.email],
    ["Role", profile?.role || "employee"],
    ["Leave quota", profile?.leave_quota ?? "-"],
    ["Shift start", profile?.shift_start ?? "-"],
  ];

  return (
    <dl className="user-info-card">
      {rows.map(([label, value]) => (
        <div className="user-info-row" key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
