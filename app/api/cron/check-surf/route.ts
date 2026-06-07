import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPush, pushConfigured } from "@/lib/push";
import {
  fetchConditions,
  scoreDay,
  windowMessage,
  dayKey,
  DEFAULT_PREFS,
  type SurfPrefs,
} from "@/lib/surf";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface PrefRow {
  user_id: string;
  enabled: boolean;
  min_wave_m: number;
  max_wave_m: number;
  low_tide_window_h: number;
  max_wind_kmh: number;
  hour_start: number;
  hour_end: number;
}

interface SubRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

function prefsFromRow(p: PrefRow): SurfPrefs {
  return {
    minWaveM: Number(p.min_wave_m ?? DEFAULT_PREFS.minWaveM),
    maxWaveM: Number(p.max_wave_m ?? DEFAULT_PREFS.maxWaveM),
    lowTideWindowH: Number(p.low_tide_window_h ?? DEFAULT_PREFS.lowTideWindowH),
    maxWindKmh: Number(p.max_wind_kmh ?? DEFAULT_PREFS.maxWindKmh),
    hourStart: Number(p.hour_start ?? DEFAULT_PREFS.hourStart),
    hourEnd: Number(p.hour_end ?? DEFAULT_PREFS.hourEnd),
  };
}

/**
 * Cron entry point (Vercel Cron / manual curl).
 * Auth: header `Authorization: Bearer <CRON_SECRET>` OR `?secret=<CRON_SECRET>`.
 * For each enabled user with a good-surf window today (and no alert sent today),
 * sends a Web Push to all their devices and logs it (anti-spam).
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET ?? "";
  const auth = request.headers.get("authorization") ?? "";
  const qSecret = new URL(request.url).searchParams.get("secret") ?? "";
  const provided = auth.startsWith("Bearer ") ? auth.slice(7) : qSecret;
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (!pushConfigured()) {
    return NextResponse.json({ error: "VAPID keys not configured" }, { status: 503 });
  }
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase service role not configured" }, { status: 503 });
  }

  // 1. Live conditions → today's good-surf windows (per default thresholds first,
  //    re-scored per user below since thresholds can be customised).
  const hours = await fetchConditions();
  const today = dayKey(new Date());
  const todayRows = hours.filter((h) => h.day === today);
  if (!todayRows.length) {
    return NextResponse.json({ ok: true, checked: 0, sent: 0, reason: "no data for today" });
  }

  // 2. Enabled users who have NOT been notified today.
  const { data: prefs, error: prefErr } = await supabase
    .from("surf_preferences")
    .select("*")
    .eq("enabled", true);
  if (prefErr) return NextResponse.json({ error: prefErr.message }, { status: 500 });

  const { data: sentToday } = await supabase
    .from("notifications_log")
    .select("user_id")
    .eq("day", today);
  const alreadyNotified = new Set((sentToday ?? []).map((r) => r.user_id));

  const candidates = (prefs ?? []).filter((p: PrefRow) => !alreadyNotified.has(p.user_id));

  let sent = 0;
  let usersNotified = 0;
  const removedSubs: string[] = [];

  for (const pref of candidates as PrefRow[]) {
    const windows = scoreDay(todayRows, prefsFromRow(pref));
    if (!windows.length) continue;

    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("*")
      .eq("user_id", pref.user_id);
    if (!subs?.length) continue;

    const payload = { ...windowMessage(windows[0]), url: "/", tag: "surf-alert" };
    let delivered = false;

    for (const sub of subs as SubRow[]) {
      const res = await sendPush(
        { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
        payload,
      );
      if (res.ok) {
        delivered = true;
        sent++;
      } else if (res.gone) {
        await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        removedSubs.push(sub.id);
      }
    }

    if (delivered) {
      usersNotified++;
      await supabase
        .from("notifications_log")
        .upsert(
          { user_id: pref.user_id, day: today, reason: windowMessage(windows[0]).body },
          { onConflict: "user_id,day" },
        );
    }
  }

  return NextResponse.json({
    ok: true,
    day: today,
    candidates: candidates.length,
    usersNotified,
    pushSent: sent,
    expiredRemoved: removedSubs.length,
  });
}
