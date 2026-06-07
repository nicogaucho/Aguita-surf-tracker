"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** Numeric fields are kept as strings while editing so the field can be cleared. */
interface Prefs {
  enabled: boolean;
  min_wave_m: string;
  max_wave_m: string;
  low_tide_window_h: string;
  max_wind_kmh: string;
  hour_start: string;
  hour_end: string;
  notify_hour: number;
}

const NUM_DEFAULTS = {
  min_wave_m: 0.5,
  max_wave_m: 1.5,
  low_tide_window_h: 1.5,
  max_wind_kmh: 18,
  hour_start: 7,
  hour_end: 20,
} as const;
type NumKey = keyof typeof NUM_DEFAULTS;

type Msg = { kind: "ok" | "err"; text: string } | null;

function urlBase64ToArrayBuffer(base64: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const buffer = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return buffer;
}

export default function SettingsClient({
  vapidPublicKey,
  userEmail,
}: {
  vapidPublicKey: string;
  userEmail: string;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [pushOn, setPushOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const supported = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;

  useEffect(() => {
    fetch("/api/preferences")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) return;
        // Stringify numeric fields for editing.
        setPrefs({
          enabled: d.enabled,
          notify_hour: d.notify_hour,
          min_wave_m: String(d.min_wave_m),
          max_wave_m: String(d.max_wave_m),
          low_tide_window_h: String(d.low_tide_window_h),
          max_wind_kmh: String(d.max_wind_kmh),
          hour_start: String(d.hour_start),
          hour_end: String(d.hour_end),
        });
      })
      .catch(() => {});
    // Reflect current push subscription state.
    if (supported) {
      navigator.serviceWorker.getRegistration().then(async (reg) => {
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        setPushOn(Boolean(sub));
      });
    }
  }, [supported]);

  async function enablePush() {
    setBusy(true);
    setMsg(null);
    try {
      if (!vapidPublicKey) throw new Error("Missing public VAPID key (NEXT_PUBLIC_VAPID_PUBLIC_KEY).");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Notification permission denied by the browser.");

      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToArrayBuffer(vapidPublicKey),
        });
      }

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to save subscription");

      setPushOn(true);
      setMsg({ kind: "ok", text: "notifications enabled on this device." });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  async function disablePush() {
    setBusy(true);
    setMsg(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setPushOn(false);
      setMsg({ kind: "ok", text: "notifications disabled on this device." });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Test failed");
      setMsg({ kind: "ok", text: `test sent to ${data.sent} device${data.sent === 1 ? "" : "s"} — check your phone.` });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  async function savePrefs(e: React.FormEvent) {
    e.preventDefault();
    if (!prefs) return;
    setBusy(true);
    setMsg(null);
    // Parse string fields back to numbers; empty/invalid falls back to the default.
    const num = (k: NumKey) => {
      const s = String(prefs[k]).trim();
      if (s === "") return NUM_DEFAULTS[k];
      const v = Number(s);
      return Number.isFinite(v) ? v : NUM_DEFAULTS[k];
    };
    const payload = {
      enabled: prefs.enabled,
      min_wave_m: num("min_wave_m"),
      max_wave_m: num("max_wave_m"),
      low_tide_window_h: num("low_tide_window_h"),
      max_wind_kmh: num("max_wind_kmh"),
      hour_start: num("hour_start"),
      hour_end: num("hour_end"),
    };
    const res = await fetch("/api/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setBusy(false);
    if (res.ok) {
      setMsg({ kind: "ok", text: "Preferences saved." });
    } else {
      setMsg({ kind: "err", text: (await res.json()).error ?? "Save failed" });
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  const set = <K extends keyof Prefs>(k: K, v: Prefs[K]) =>
    setPrefs((p) => (p ? { ...p, [k]: v } : p));

  return (
    <>
      {/* Push activation */}
      <section className="panel">
        <div className="panel-head"><h2>Push notifications</h2></div>
        {!supported ? (
          <p className="msg err">this browser doesn&apos;t support push notifications.</p>
        ) : pushOn ? (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn btn--accent" onClick={sendTest} disabled={busy}>send a test notification</button>
            <button className="btn btn--ghost" onClick={disablePush} disabled={busy}>disable on this device</button>
          </div>
        ) : (
          <button className="btn btn--primary" onClick={enablePush} disabled={busy}>enable notifications on this device</button>
        )}
        <p className="note">
          <strong>on iPhone</strong>: open the site in Safari, tap <em>Share → Add to Home Screen</em>,
          then open the app from the Home Screen and enable notifications here (requires iOS 16.4+).
        </p>
      </section>

      {/* Preferences */}
      <form className="panel" onSubmit={savePrefs}>
        <div className="panel-head"><h2>Preferred surf conditions</h2></div>
        {!prefs ? (
          <p style={{ color: "var(--fg-2)" }}>Loading preferences…</p>
        ) : (
          <>
            <div className="field">
              <label>
                <input
                  type="checkbox"
                  checked={prefs.enabled}
                  onChange={(e) => set("enabled", e.target.checked)}
                /> {" "}receive surf alerts
              </label>
            </div>
            <div className="field-row">
              <div className="field">
                <label>Min wave (m)</label>
                <input type="number" step="0.1" value={prefs.min_wave_m}
                  onChange={(e) => set("min_wave_m", e.target.value)} />
              </div>
              <div className="field">
                <label>Max wave (m)</label>
                <input type="number" step="0.1" value={prefs.max_wave_m}
                  onChange={(e) => set("max_wave_m", e.target.value)} />
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label>Low-tide window (h)</label>
                <input type="number" step="0.5" value={prefs.low_tide_window_h}
                  onChange={(e) => set("low_tide_window_h", e.target.value)} />
              </div>
              <div className="field">
                <label>Max wind (km/h)</label>
                <input type="number" step="1" value={prefs.max_wind_kmh}
                  onChange={(e) => set("max_wind_kmh", e.target.value)} />
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label>Start hour</label>
                <input type="number" min="0" max="23" value={prefs.hour_start}
                  onChange={(e) => set("hour_start", e.target.value)} />
              </div>
              <div className="field">
                <label>End hour</label>
                <input type="number" min="0" max="23" value={prefs.hour_end}
                  onChange={(e) => set("hour_end", e.target.value)} />
              </div>
            </div>
            <button className="btn btn--primary" type="submit" disabled={busy}>save preferences</button>
          </>
        )}
      </form>

      {msg && <p className={`msg ${msg.kind}`}>{msg.text}</p>}

      <section style={{ marginTop: 24 }}>
        <button className="btn" onClick={signOut}>sign out ({userEmail})</button>
      </section>
    </>
  );
}
