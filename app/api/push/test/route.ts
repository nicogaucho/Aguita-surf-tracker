import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendPush, pushConfigured } from "@/lib/push";

interface SubRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Send a test push to all of the caller's own registered devices.
 * Lets a signed-in user verify notifications work, independent of surf conditions.
 */
export async function POST() {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "auth not configured" }, { status: 503 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!pushConfigured()) {
    return NextResponse.json({ error: "VAPID keys not configured" }, { status: 503 });
  }

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", user.id);

  if (!subs?.length) {
    return NextResponse.json({ error: "no devices registered — enable notifications first" }, { status: 400 });
  }

  const payload = {
    title: "Agüita Surf — test",
    body: "Notifications are working. We'll ping you when it's a good time to surf at La Cícer.",
    url: "/",
    tag: "test",
  };

  let sent = 0;
  let removed = 0;
  for (const sub of subs as SubRow[]) {
    const res = await sendPush(sub, payload);
    if (res.ok) sent++;
    else if (res.gone) {
      await supabase.from("push_subscriptions").delete().eq("id", sub.id);
      removed++;
    }
  }

  return NextResponse.json({ ok: true, devices: subs.length, sent, removed });
}
