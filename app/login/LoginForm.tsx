"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginForm() {
  const supabase = createClient();
  const params = useSearchParams();
  const next = params.get("next") ?? "/settings";

  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const redirectTo = (path: string) =>
    typeof window !== "undefined" ? `${window.location.origin}${path}` : path;

  async function signInGoogle() {
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirectTo(`/auth/callback?next=${encodeURIComponent(next)}`) },
    });
    if (error) {
      setMsg({ kind: "err", text: error.message });
      setBusy(false);
    }
  }

  async function signInEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo(`/auth/callback?next=${encodeURIComponent(next)}`) },
    });
    setBusy(false);
    if (error) {
      setMsg({ kind: "err", text: error.message });
    } else {
      setMsg({ kind: "ok", text: "Ti abbiamo inviato un link magico via email. Aprilo su questo dispositivo." });
    }
  }

  return (
    <>
      <button className="btn btn--ghost btn--block" onClick={signInGoogle} disabled={busy}>
        continua con google
      </button>

      <div className="divider">oppure</div>

      <form onSubmit={signInEmail}>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            required
            placeholder="tu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <button className="btn btn--primary btn--block" type="submit" disabled={busy || !email}>
          inviami un link magico
        </button>
      </form>

      {msg && <p className={`msg ${msg.kind}`}>{msg.text}</p>}
    </>
  );
}
