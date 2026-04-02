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
        error: userError,
      } = await supabase.auth.getUser();
      setUser(user);
      if (user) {
        const { data: profile, error: profileError } = await supabase
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

  if (loading) return <div>Loading user info...</div>;
  if (!user) return <div>Please log in to view your dashboard.</div>;
  return (
    <div className="user-info-card">
      <div>
        <b>Name:</b> {profile?.full_name || user.email}
      </div>
      <div>
        <b>Email:</b> {user.email}
      </div>
      <div>
        <b>Role:</b> {profile?.role || "employee"}
      </div>
      <div>
        <b>Leave Quota:</b> {profile?.leave_quota ?? "-"}
      </div>
      <div>
        <b>Shift Start:</b> {profile?.shift_start ?? "-"}
      </div>
    </div>
  );
}
