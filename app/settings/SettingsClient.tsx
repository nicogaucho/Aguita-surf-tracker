"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface Prefs {
  enabled: boolean;
  min_wave_m: number;
  max_wave_m: number;
  low_tide_window_h: number;
  max_wind_kmh: number;
  hour_start: number;
  hour_end: number;
  notify_hour: number;
}

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
      .then((d) => { if (!d.error) setPrefs(d); })
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
      if (!vapidPublicKey) throw new Error("Chiave VAPID pubblica mancante (NEXT_PUBLIC_VAPID_PUBLIC_KEY).");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Permesso notifiche negato dal browser.");

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
      if (!res.ok) throw new Error((await res.json()).error ?? "Errore salvataggio subscription");

      setPushOn(true);
      setMsg({ kind: "ok", text: "notifiche attivate su questo dispositivo." });
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
      setMsg({ kind: "ok", text: "Notifiche disattivate su questo dispositivo." });
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
    const res = await fetch("/api/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(prefs),
    });
    setBusy(false);
    if (res.ok) {
      setMsg({ kind: "ok", text: "Preferenze salvate." });
    } else {
      setMsg({ kind: "err", text: (await res.json()).error ?? "Errore salvataggio" });
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
        <div className="panel-head"><h2>Notifiche push</h2></div>
        {!supported ? (
          <p className="msg err">questo browser non supporta le notifiche push.</p>
        ) : pushOn ? (
          <button className="btn btn--ghost" onClick={disablePush} disabled={busy}>disattiva su questo dispositivo</button>
        ) : (
          <button className="btn btn--primary" onClick={enablePush} disabled={busy}>attiva notifiche su questo dispositivo</button>
        )}
        <p className="note">
          <strong>su iPhone</strong>: apri il sito in Safari, tocca <em>Condividi → Aggiungi a Home</em>,
          poi apri l&apos;app dalla Home e attiva qui le notifiche (richiede iOS 16.4+).
        </p>
      </section>

      {/* Preferences */}
      <form className="panel" onSubmit={savePrefs}>
        <div className="panel-head"><h2>Condizioni surf preferite</h2></div>
        {!prefs ? (
          <p style={{ color: "var(--muted)" }}>Caricamento preferenze…</p>
        ) : (
          <>
            <div className="field">
              <label>
                <input
                  type="checkbox"
                  checked={prefs.enabled}
                  onChange={(e) => set("enabled", e.target.checked)}
                /> {" "}ricevi avvisi surf
              </label>
            </div>
            <div className="field-row">
              <div className="field">
                <label>Onda minima (m)</label>
                <input type="number" step="0.1" value={prefs.min_wave_m}
                  onChange={(e) => set("min_wave_m", Number(e.target.value))} />
              </div>
              <div className="field">
                <label>Onda massima (m)</label>
                <input type="number" step="0.1" value={prefs.max_wave_m}
                  onChange={(e) => set("max_wave_m", Number(e.target.value))} />
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label>Tolleranza bassa marea (h)</label>
                <input type="number" step="0.5" value={prefs.low_tide_window_h}
                  onChange={(e) => set("low_tide_window_h", Number(e.target.value))} />
              </div>
              <div className="field">
                <label>Vento massimo (km/h)</label>
                <input type="number" step="1" value={prefs.max_wind_kmh}
                  onChange={(e) => set("max_wind_kmh", Number(e.target.value))} />
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label>Ora inizio</label>
                <input type="number" min="0" max="23" value={prefs.hour_start}
                  onChange={(e) => set("hour_start", Number(e.target.value))} />
              </div>
              <div className="field">
                <label>Ora fine</label>
                <input type="number" min="0" max="23" value={prefs.hour_end}
                  onChange={(e) => set("hour_end", Number(e.target.value))} />
              </div>
            </div>
            <button className="btn btn--primary" type="submit" disabled={busy}>salva preferenze</button>
          </>
        )}
      </form>

      {msg && <p className={`msg ${msg.kind}`}>{msg.text}</p>}

      <section style={{ marginTop: 24 }}>
        <button className="btn" onClick={signOut}>esci ({userEmail})</button>
      </section>
    </>
  );
}
