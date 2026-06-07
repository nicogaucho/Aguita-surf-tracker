"use client";

import { useEffect, useMemo, useState } from "react";
import {
  LOCATION,
  DEFAULT_PREFS,
  fetchConditions,
  scoreDay,
  compass,
  waveWord,
  fmt,
  dayKey,
  dayLabel,
  uniqueDays,
  type HourRecord,
  type SurfWindow,
} from "@/lib/surf";
import TideChart from "./TideChart";

type Status = { kind: "loading" | "ok" | "err"; text: string };

export default function Dashboard() {
  const [hours, setHours] = useState<HourRecord[]>([]);
  const [activeDay, setActiveDay] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "loading", text: "Fetching live data from Open-Meteo…" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchConditions();
        if (cancelled) return;
        if (!data.length) throw new Error("No hourly data returned");
        setHours(data);
        const days = uniqueDays(data);
        const today = dayKey(new Date());
        setActiveDay(days.includes(today) ? today : days[0]);
        const updated = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
        setStatus({ kind: "ok", text: `Live data · updated ${updated} (local time, ${LOCATION.timezone})` });
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setStatus({ kind: "err", text: `Could not load data: ${message}. Check your connection and reload.` });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const days = useMemo(() => uniqueDays(hours), [hours]);
  const dayRows = useMemo(
    () => (activeDay ? hours.filter((h) => h.day === activeDay) : []),
    [hours, activeDay],
  );
  const windows = useMemo(() => scoreDay(dayRows, DEFAULT_PREFS), [dayRows]);

  const current = useMemo(() => nearestToNow(hours), [hours]);
  const todayKey = dayKey(new Date());
  const surfHours = useMemo(() => {
    const s = new Set<number>();
    for (const w of windows) for (let h = w.startHour; h <= w.endHour; h++) s.add(h);
    return s;
  }, [windows]);

  const tideRange = useMemo(() => {
    const tides = dayRows.map((r) => r.tide).filter((v): v is number => v != null);
    return tides.length
      ? `low ${Math.min(...tides).toFixed(2)} m · high ${Math.max(...tides).toFixed(2)} m`
      : "";
  }, [dayRows]);

  return (
    <main className="container">
      <section className="status-bar" aria-live="polite">
        <span className={`dot${status.kind === "ok" ? " ok" : status.kind === "err" ? " err" : ""}`} />
        <span>{status.text}</span>
      </section>

      <SurfBanner windows={windows} isToday={activeDay === todayKey} />

      {/* Current conditions */}
      <section className="cards" aria-label="Current conditions">
        <article className="card card--tide">
          <h2>Tide</h2>
          <div className="card-main"><span className="big">{fmt(current?.tide ?? null, 2)}</span><span className="unit">m</span></div>
          <p className="card-sub">{tideTrend(hours, current)}</p>
        </article>
        <article className="card card--wind">
          <h2>Wind</h2>
          <div className="card-main"><span className="big">{fmt(current?.windSpeed ?? null, 0)}</span><span className="unit">km/h</span></div>
          <p className="card-sub">
            <span className="compass" aria-hidden="true" style={{ transform: `rotate(${current?.windDir ?? 0}deg)` }}>↑</span>
            <span>{current?.windDir != null ? `${compass(current.windDir)} (${Math.round(current.windDir)}°)` : "—"}</span>
          </p>
        </article>
        <article className="card card--wave">
          <h2>Waves</h2>
          <div className="card-main"><span className="big">{fmt(current?.wave ?? null, 2)}</span><span className="unit">m</span></div>
          <p className="card-sub">{current?.wave != null ? `${waveWord(current.wave)} · significant height` : "significant wave height"}</p>
        </article>
      </section>

      {/* Day selector */}
      <nav className="day-nav" aria-label="Choose day">
        {days.map((day) => (
          <button
            key={day}
            className={`day-btn${day === activeDay ? " active" : ""}`}
            onClick={() => setActiveDay(day)}
          >
            {day === todayKey ? "oggi" : dayLabel(day)}
          </button>
        ))}
      </nav>

      {/* Tide chart */}
      <section className="panel">
        <div className="panel-head">
          <h2>Tide by the hour</h2>
          <span className="panel-meta">{tideRange}</span>
        </div>
        {dayRows.length ? (
          <TideChart rows={dayRows} windows={windows} />
        ) : (
          <div className="chart-empty">Loading tide data…</div>
        )}
      </section>

      {/* Hourly table */}
      <section className="panel">
        <div className="panel-head">
          <h2>Hourly forecast</h2>
          <span className="panel-meta">tide · wind · waves</span>
        </div>
        <div className="table-wrap">
          <table className="hourly">
            <thead>
              <tr>
                <th scope="col">Hour</th>
                <th scope="col">Tide (m)</th>
                <th scope="col">Wind</th>
                <th scope="col">Wave (m)</th>
              </tr>
            </thead>
            <tbody>
              {dayRows.map((r) => {
                const maxWave = Math.max(0.1, ...dayRows.map((x) => x.wave ?? 0));
                const barW = r.wave != null ? Math.round((r.wave / maxWave) * 60) : 0;
                const isNow = r.day === todayKey && r.hour === new Date().getHours();
                const isSurf = surfHours.has(r.hour);
                return (
                  <tr key={r.time} className={[isNow ? "now" : "", isSurf ? "surf" : ""].join(" ").trim()}>
                    <td>{String(r.hour).padStart(2, "0")}:00</td>
                    <td>{fmt(r.tide, 2)}</td>
                    <td>
                      <span className="wind-cell">
                        <span className="wind-arrow" style={{ transform: `rotate(${r.windDir ?? 0}deg)` }}>↑</span>
                        <span>{fmt(r.windSpeed, 0)} km/h</span>
                        <span className="dir-label">{r.windDir != null ? compass(r.windDir) : ""}</span>
                      </span>
                    </td>
                    <td>{fmt(r.wave, 2)}<span className="bar" style={{ width: `${barW}px` }} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="site-footer">
        <p>Data: <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a> free open weather &amp; marine API (no key required). Tide = sea-level height above mean sea level.</p>
        <p className="coords">{`${LOCATION.name} · ${LOCATION.lat.toFixed(3)}°N, ${Math.abs(LOCATION.lon).toFixed(3)}°W · ${LOCATION.timezone}`}</p>
      </footer>
    </main>
  );
}

function SurfBanner({ windows, isToday }: { windows: SurfWindow[]; isToday: boolean }) {
  const when = isToday ? "oggi" : "in questo giorno";
  if (!windows.length) {
    return (
      <section className="surf-banner none">
        <span className="tag" aria-hidden="true">≈</span>
        <span>nessuna finestra di buon surf {when} — serve bassa marea con onda 0.5–1.5 m e vento leggero.</span>
      </section>
    );
  }
  const best = windows[0];
  const span = best.startHour === best.endHour
    ? `${String(best.bestHour).padStart(2, "0")}h`
    : `${String(best.startHour).padStart(2, "0")}–${String(best.endHour).padStart(2, "0")}h`;
  return (
    <section className="surf-banner">
      <span className="tag" aria-hidden="true">≈</span>
      <span>
        buon surf {when}: <strong>{span}</strong> in bassa marea — onda {fmt(best.wave, 1)} m, vento {fmt(best.windSpeed, 0)} km/h
        {best.windDir != null ? ` ${compass(best.windDir)}` : ""}.
        {windows.length > 1 ? ` (+${windows.length - 1} altra finestra)` : ""}
      </span>
    </section>
  );
}

/* ---- helpers (ported from legacy renderCurrent) ---- */
function nearestToNow(hours: HourRecord[]): HourRecord | null {
  if (!hours.length) return null;
  const now = Date.now();
  let cur = hours[0];
  let best = Infinity;
  for (const h of hours) {
    const diff = Math.abs(new Date(h.time).getTime() - now);
    if (diff < best) { best = diff; cur = h; }
  }
  return cur;
}

function tideTrend(hours: HourRecord[], cur: HourRecord | null): string {
  if (!cur) return "sea level (MSL)";
  const idx = hours.indexOf(cur);
  const next = hours[idx + 1];
  if (next && cur.tide != null && next.tide != null) {
    return next.tide > cur.tide ? "rising ▲" : "falling ▼";
  }
  return "sea level (MSL)";
}
