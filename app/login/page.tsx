import { Suspense } from "react";
import SiteHeader from "../components/SiteHeader";
import LoginForm from "./LoginForm";
import { supabaseConfigured } from "@/lib/supabase/env";

export default function LoginPage() {
  return (
    <>
      <SiteHeader right={<span />} />
      <div className="auth-wrap">
        <div className="auth-card">
          <h1>Sign in to Agüita Surf</h1>
          <p className="sub">Get a notification on your phone when it&apos;s a good time to surf at La Cícer.</p>
          {supabaseConfigured ? (
            <Suspense fallback={<p className="sub">Loading…</p>}>
              <LoginForm />
            </Suspense>
          ) : (
            <p className="msg err">
              Authentication not configured. Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and
              {" "}<code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in <code>.env.local</code>.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
