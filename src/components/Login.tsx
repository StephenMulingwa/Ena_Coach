"use client";

import { useState } from "react";
import Image from "next/image";

interface LoginProps {
  onLogin: () => Promise<void>;
}

export default function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (username === "Ena-Coach" && password === "Ena-Coach@2008") {
      setError("");
      setLoading(true);
      try {
        await onLogin();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load report data.";
        setError(message);
      } finally {
        setLoading(false);
      }
    } else {
      setError("Invalid username or password");
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg)",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "20%",
          left: "50%",
          transform: "translateX(-50%)",
          width: "400px",
          height: "400px",
          background: "radial-gradient(circle, rgba(245,166,35,0.08) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          width: "100%",
          maxWidth: "420px",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: "40px 36px",
          position: "relative",
          zIndex: 1,
          boxShadow: "var(--shadow)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "28px" }}>
          <div style={{ display: "flex", justifyContent: "center", width: "100%" }}>
          <Image
            src="/enalogo.png"
            alt="Ena Fleet Insights"
            width={80}
            height={80}
            loading="eager"
            priority
            style={{ borderRadius: "12px", marginBottom: "16px", display: "block" }}
          />
          </div>
          <h1
            style={{
              fontFamily: "var(--font-head)",
              fontSize: "1.3rem",
              fontWeight: 700,
              color: "var(--text)",
              letterSpacing: ".01em",
            }}
          >
            Ena <span style={{ color: "var(--accent)" }}>Fleet Insights</span>
          </h1>
          <p
            style={{
              fontSize: ".78rem",
              color: "var(--text2)",
              marginTop: "4px",
              fontWeight: 300,
              letterSpacing: ".04em",
              textTransform: "uppercase",
            }}
          >
            Secure Access Portal
          </p>
        </div>

        {error && (
          <div
            style={{
              background: "rgba(255,77,109,0.1)",
              border: "1px solid rgba(255,77,109,0.3)",
              borderRadius: "var(--radius-sm)",
              padding: "10px 14px",
              marginBottom: "16px",
              fontSize: ".82rem",
              color: "var(--red)",
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "16px" }}>
            <label
              style={{
                display: "block",
                fontSize: ".72rem",
                fontWeight: 500,
                color: "var(--text2)",
                textTransform: "uppercase",
                letterSpacing: ".06em",
                marginBottom: "6px",
              }}
            >
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              style={{
                width: "100%",
                padding: "12px 14px",
                background: "var(--surface2)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                color: "var(--text)",
                fontSize: ".88rem",
                fontFamily: "var(--font-body)",
                outline: "none",
                transition: "var(--transition)",
              }}
              onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
              onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
              placeholder="Enter username"
            />
          </div>

          <div style={{ marginBottom: "24px" }}>
            <label
              style={{
                display: "block",
                fontSize: ".72rem",
                fontWeight: 500,
                color: "var(--text2)",
                textTransform: "uppercase",
                letterSpacing: ".06em",
                marginBottom: "6px",
              }}
            >
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{
                width: "100%",
                padding: "12px 14px",
                background: "var(--surface2)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                color: "var(--text)",
                fontSize: ".88rem",
                fontFamily: "var(--font-body)",
                outline: "none",
                transition: "var(--transition)",
              }}
              onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
              onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
              placeholder="Enter password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "14px",
              background: "linear-gradient(90deg, rgba(245,166,35,0.85), rgba(245,166,35,0.55))",
              border: "1px solid rgba(245,166,35,0.35)",
              borderRadius: "var(--radius)",
              color: "#14110c",
              fontSize: ".88rem",
              fontWeight: 800,
              fontFamily: "var(--font-head)",
              cursor: loading ? "wait" : "pointer",
              letterSpacing: ".02em",
              transition: "var(--transition)",
              boxShadow: "0 6px 28px rgba(245,166,35,0.3)",
              opacity: loading ? 0.75 : 1,
            }}
          >
            {loading ? "Loading reports..." : "Log In"}
          </button>
        </form>

      </div>
    </div>
  );
}
