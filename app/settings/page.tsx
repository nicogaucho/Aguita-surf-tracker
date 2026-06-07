import { redirect } from "next/navigation";
import SiteHeader from "../components/SiteHeader";
import SettingsClient from "./SettingsClient";
import { createClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/login");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

  return (
    <>
      <SiteHeader right={<span />} />
      <div className="container" style={{ maxWidth: 640 }}>
        <h1 style={{ marginTop: 8 }}>Le tue notifiche surf</h1>
        <p style={{ color: "var(--muted)" }}>Connesso come <strong>{user.email}</strong></p>
        <SettingsClient vapidPublicKey={vapidKey} userEmail={user.email ?? ""} />
      </div>
    </>
  );
}
