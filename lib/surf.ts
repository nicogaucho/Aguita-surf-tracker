/*
 * Shared surf logic — used by both the dashboard (client) and the cron job (server).
 * Ported from the legacy app.js (mergeData / waveWord) and extended with low-tide scoring.
 *
 * Data source: Open-Meteo (https://open-meteo.com) — free, open, no API key.
 *   · Marine API : wave_height + sea_level_height_msl (tide)
 *   · Forecast API: wind_speed_10m + wind_direction_10m
 */

export const LOCATION = {
  name: "La Cícer Beach",
  lat: 28.138,
  lon: -15.443,
  timezone: "Atlantic/Canary",
} as const;

export const COMPASS = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
] as const;

export interface HourRecord {
  time: string; // ISO local time string from Open-Meteo, e.g. "2026-06-07T09:00"
  day: string; // "YYYY-MM-DD"
  hour: number; // 0-23 (local)
  tide: number | null; // sea level height above MSL, metres
  wave: number | null; // significant wave height, metres
  windSpeed: number | null; // km/h
  windDir: number | null; // degrees
}

/** Surf preference thresholds — DB defaults live in surf_preferences. */
export interface SurfPrefs {
  minWaveM: number; // default 0.5
  maxWaveM: number; // default 1.5
  lowTideWindowH: number; // tolerance in hours from a tide minimum, default 1.5
  maxWindKmh: number; // default 18
  hourStart: number; // default 7
  hourEnd: number; // default 20
}

export const DEFAULT_PREFS: SurfPrefs = {
  minWaveM: 0.5,
  maxWaveM: 1.5,
  lowTideWindowH: 1.5,
  maxWindKmh: 18,
  hourStart: 7,
  hourEnd: 20,
};

const MARINE_URL =
  `https://marine-api.open-meteo.com/v1/marine?latitude=${LOCATION.lat}` +
  `&longitude=${LOCATION.lon}` +
  `&hourly=wave_height,sea_level_height_msl` +
  `&timezone=${encodeURIComponent(LOCATION.timezone)}&forecast_days=4`;

const WEATHER_URL =
  `https://api.open-meteo.com/v1/forecast?latitude=${LOCATION.lat}` +
  `&longitude=${LOCATION.lon}` +
  `&hourly=wind_speed_10m,wind_direction_10m` +
  `&timezone=${encodeURIComponent(LOCATION.timezone)}&forecast_days=4`;

function numOrNull(v: unknown): number | null {
  return v === null || v === undefined || Number.isNaN(v) ? null : Number(v);
}

interface OpenMeteoHourly {
  hourly?: Record<string, (number | null)[] | string[]>;
}

/** Merge the two Open-Meteo responses on their shared hourly time axis. */
export function mergeData(marine: OpenMeteoHourly, weather: OpenMeteoHourly): HourRecord[] {
  const m = (marine.hourly ?? {}) as Record<string, (number | null)[] | string[]>;
  const w = (weather.hourly ?? {}) as Record<string, (number | null)[] | string[]>;
  const times = (m.time as string[]) ?? [];

  const windByTime = new Map<string, { windSpeed: number | null; windDir: number | null }>();
  ((w.time as string[]) ?? []).forEach((t, i) => {
    windByTime.set(t, {
      windSpeed: numOrNull((w.wind_speed_10m as (number | null)[])?.[i]),
      windDir: numOrNull((w.wind_direction_10m as (number | null)[])?.[i]),
    });
  });

  return times.map((t, i) => {
    const wind = windByTime.get(t) ?? { windSpeed: null, windDir: null };
    const d = new Date(t);
    return {
      time: t,
      day: t.slice(0, 10),
      hour: d.getHours(),
      tide: numOrNull((m.sea_level_height_msl as (number | null)[])?.[i]),
      wave: numOrNull((m.wave_height as (number | null)[])?.[i]),
      windSpeed: wind.windSpeed,
      windDir: wind.windDir,
    };
  });
}

/** Fetch + merge live conditions. Works in browser and on the server (Node fetch). */
export async function fetchConditions(): Promise<HourRecord[]> {
  const [marineRes, weatherRes] = await Promise.all([
    fetch(MARINE_URL),
    fetch(WEATHER_URL),
  ]);
  if (!marineRes.ok) throw new Error(`Marine API HTTP ${marineRes.status}`);
  if (!weatherRes.ok) throw new Error(`Forecast API HTTP ${weatherRes.status}`);
  const [marine, weather] = await Promise.all([marineRes.json(), weatherRes.json()]);
  return mergeData(marine, weather);
}

/**
 * Indices of local tide minima (low tide) within a day's hourly rows.
 * A point is a minimum when its tide is <= both neighbours. Day endpoints
 * count if they fall toward the lower end of the day's tidal range.
 */
export function lowTideIndices(dayRows: HourRecord[]): number[] {
  const tides = dayRows.map((r) => r.tide);
  const valid = tides.filter((v): v is number => v != null);
  if (valid.length < 2) return [];
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const lowerBand = min + (max - min) * 0.5; // "low" half of the day's range

  const mins: number[] = [];
  for (let i = 0; i < dayRows.length; i++) {
    const v = tides[i];
    if (v == null) continue;
    const prev = i > 0 ? tides[i - 1] : null;
    const next = i < dayRows.length - 1 ? tides[i + 1] : null;
    const leOK = prev == null || v <= prev;
    const reOK = next == null || v <= next;
    if (leOK && reOK && v <= lowerBand) mins.push(i);
  }
  return mins;
}

export interface SurfWindow {
  day: string;
  startHour: number;
  endHour: number;
  bestHour: number;
  wave: number | null;
  windSpeed: number | null;
  windDir: number | null;
  tide: number | null;
}

/**
 * Returns the "good surf" windows for a single day:
 * hours where wave is in [minWaveM, maxWaveM], wind below max, within daylight
 * band, AND close (lowTideWindowH) to a tide minimum (low tide).
 * Contiguous good hours are merged into one window.
 */
export function scoreDay(dayRows: HourRecord[], prefs: SurfPrefs = DEFAULT_PREFS): SurfWindow[] {
  if (!dayRows.length) return [];
  const lows = lowTideIndices(dayRows);
  if (!lows.length) return [];

  const goodIdx = new Set<number>();
  dayRows.forEach((r, i) => {
    if (r.wave == null || r.windSpeed == null) return;
    const waveOK = r.wave >= prefs.minWaveM && r.wave <= prefs.maxWaveM;
    const windOK = r.windSpeed < prefs.maxWindKmh;
    const dayOK = r.hour >= prefs.hourStart && r.hour <= prefs.hourEnd;
    // Near a low-tide minimum (assumes hourly rows → index distance ≈ hours).
    const nearLow = lows.some((li) => Math.abs(li - i) <= prefs.lowTideWindowH);
    if (waveOK && windOK && dayOK && nearLow) goodIdx.add(i);
  });

  // Merge contiguous good indices into windows.
  const windows: SurfWindow[] = [];
  const sorted = [...goodIdx].sort((a, b) => a - b);
  let run: number[] = [];
  const flush = () => {
    if (!run.length) return;
    const rows = run.map((i) => dayRows[i]);
    // Best hour = closest to a low-tide minimum.
    let best = rows[0];
    let bestDist = Infinity;
    for (const ri of run) {
      const dist = Math.min(...lows.map((li) => Math.abs(li - ri)));
      if (dist < bestDist) { bestDist = dist; best = dayRows[ri]; }
    }
    windows.push({
      day: best.day,
      startHour: rows[0].hour,
      endHour: rows[rows.length - 1].hour,
      bestHour: best.hour,
      wave: best.wave,
      windSpeed: best.windSpeed,
      windDir: best.windDir,
      tide: best.tide,
    });
    run = [];
  };
  for (let k = 0; k < sorted.length; k++) {
    if (run.length && sorted[k] !== run[run.length - 1] + 1) flush();
    run.push(sorted[k]);
  }
  flush();
  return windows;
}

/** Build a human notification message for a window (used by the cron). */
export function windowMessage(win: SurfWindow): { title: string; body: string } {
  const hh = (h: number) => `${String(h).padStart(2, "0")}h`;
  const dir = win.windDir != null ? ` ${compass(win.windDir)}` : "";
  const span = win.startHour === win.endHour ? hh(win.bestHour) : `${hh(win.startHour)}–${hh(win.endHour)}`;
  return {
    title: "🌊 Buon surf a La Cícer!",
    body:
      `${span} (bassa marea): onda ${fmt(win.wave, 1)}m, ` +
      `vento ${fmt(win.windSpeed, 0)}km/h${dir}.`,
  };
}

/* ---- Display helpers (ported from legacy app.js) ---- */
export function compass(deg: number): string {
  return COMPASS[Math.round(deg / 22.5) % 16];
}

export function waveWord(m: number): string {
  if (m < 0.3) return "Flat";
  if (m < 0.6) return "Small";
  if (m < 1.0) return "Knee–waist high";
  if (m < 1.5) return "Chest high";
  if (m < 2.5) return "Overhead";
  return "Big";
}

export function fmt(v: number | null, dp: number): string {
  return v == null ? "—" : v.toFixed(dp);
}

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function dayLabel(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric" });
}

export function uniqueDays(hours: HourRecord[]): string[] {
  return [...new Set(hours.map((h) => h.day))];
}
