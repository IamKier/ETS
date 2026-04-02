import { useState } from "react";
import { supabase } from "../../supabaseClient";

export default function LoginPage({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (error) setError(error.message);
    else if (onLogin) onLogin();
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100vw",
        background:
          'url("/images/G4pfn18bcAAx_7z.jpg") center center/cover no-repeat',
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Side drawer for login panel */}
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          height: "100vh",
          width: 400,
          maxWidth: "100vw",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(255,255,255,0.18)",
          boxShadow: "-8px 0 32px 0 rgba(31, 38, 135, 0.15)",
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
          borderLeft: "1.5px solid rgba(255,255,255,0.22)",
          zIndex: 2,
        }}
      >
        <div
          style={{
            width: 320,
            minHeight: 400,
            background: "rgba(255,255,255,0.22)",
            borderRadius: 18,
            boxShadow: "0 8px 32px 0 rgba(31, 38, 135, 0.15)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "36px 28px 32px 28px",
            margin: 24,
            border: "1.5px solid rgba(255,255,255,0.22)",
          }}
        >
          <h2
            style={{
              color: "#111",
              fontWeight: 700,
              marginBottom: 32,
              fontSize: "2rem",
              letterSpacing: 1,
            }}
          >
            Login
          </h2>
          <form onSubmit={handleSubmit} style={{ width: "100%" }}>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                width: "100%",
                marginBottom: 16,
                padding: 10,
                borderRadius: 4,
                border: "1px solid #e5e7eb",
                background: "#f3f4f6",
                color: "#222",
                fontSize: 16,
              }}
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{
                width: "100%",
                marginBottom: 20,
                padding: 10,
                borderRadius: 4,
                border: "1px solid #e5e7eb",
                background: "#f3f4f6",
                color: "#222",
                fontSize: 16,
              }}
            />
            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                padding: 12,
                borderRadius: 4,
                background: "#111",
                color: "#fff",
                fontWeight: 600,
                fontSize: 16,
                border: "none",
                cursor: "pointer",
                marginTop: 8,
              }}
            >
              {loading ? "Logging in..." : "Login"}
            </button>
          </form>
          {error && <div style={{ color: "red", marginTop: 16 }}>{error}</div>}
        </div>
      </div>
    </div>
  );
}
