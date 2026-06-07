import SiteHeader from "../components/SiteHeader";
import LoginForm from "./LoginForm";
import { supabaseConfigured } from "@/lib/supabase/env";

export default function LoginPage() {
  return (
    <>
      <SiteHeader right={<span />} />
      <div className="auth-wrap">
        <div className="auth-card">
          <h1>Accedi ad Agüita Surf</h1>
          <p className="sub">Ricevi una notifica sullo smartphone quando è il momento giusto per fare surf a La Cícer.</p>
          {supabaseConfigured ? (
            <LoginForm />
          ) : (
            <p className="msg err">
              Autenticazione non configurata. Imposta <code>NEXT_PUBLIC_SUPABASE_URL</code> e
              {" "}<code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in <code>.env.local</code>.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
