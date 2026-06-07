import Link from "next/link";
import SiteHeader from "./components/SiteHeader";
import Dashboard from "./components/Dashboard";
import { getUser } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/supabase/env";

export default async function Home() {
  const user = supabaseConfigured ? await getUser() : null;

  return (
    <>
      <SiteHeader
        right={
          <div className="header-actions">
            {user ? (
              <Link className="btn btn--ghost" href="/settings">le mie notifiche</Link>
            ) : (
              <Link className="btn btn--primary" href="/login">accedi · attiva avvisi</Link>
            )}
          </div>
        }
      />
      <Dashboard />
    </>
  );
}
