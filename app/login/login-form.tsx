"use client";

import { ArrowRight, Eye, EyeOff, LockKeyhole, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Sign in failed");
      router.push("/");
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Sign in failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-brand-panel">
        <div className="login-brand">
          <img src="/js-logo-white.svg" alt="Jiant Solutions" />
          <span>INTERNAL COMMERCE INTELLIGENCE</span>
        </div>
        <div className="login-brand-copy">
          <span>SHIPPING PERFORMANCE</span>
          <h1>Clarity across<br />every order.</h1>
          <p>One private workspace for weekly DTC and B2B performance, late-order review, and team follow-through.</p>
        </div>
        <div className="login-security"><ShieldCheck size={16} /><span>Authorized team members only</span></div>
      </section>
      <section className="login-form-panel">
        <form onSubmit={submit}>
          <div className="login-form-icon"><LockKeyhole size={23} /></div>
          <span className="eyebrow">Jiant internal access</span>
          <h2>Sign in to the dashboard</h2>
          <p>Enter your assigned credentials to continue.</p>
          <label><span>Username</span><input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Enter username" required autoFocus /></label>
          <label><span>Password</span><div className="password-field"><input type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter password" required /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
          {error && <div className="login-error">{error}</div>}
          <button className="login-submit" disabled={loading}>{loading ? "Signing in…" : "Secure login"}<ArrowRight size={17} /></button>
          <small>Protected workspace · Activity is limited to authorized users</small>
        </form>
      </section>
    </main>
  );
}
