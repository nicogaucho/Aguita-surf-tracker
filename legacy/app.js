/*
 * Agüita House Sustainability Lab
 * La Cícer beach conditions — tide, wind & waves
 * Data source: Open-Meteo (https://open-meteo.com) — free, open, no API key.
 *   · Marine API : wave height + sea-level height (tide)
 *   · Forecast API: wind speed + direction
 */

// La Cícer is the southern (surf) end of Playa de Las Canteras,
// Las Palmas de Gran Canaria, Canary Islands.
const LOCATION = {
  name: "La Cícer Beach",
  lat: 28.138,
  lon: -15.443,
  timezone: "Atlantic/Canary",
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

const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
                 "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

const $ = (id) => document.getElementById(id);

let HOURS = [];     // merged hourly records
let DAYS = [];      // unique YYYY-MM-DD keys
let activeDay = null;

document.addEventListener("DOMContentLoaded", init);

async function init() {
  $("coords").textContent =
    `${LOCATION.name} · ${LOCATION.lat.toFixed(3)}°N, ${Math.abs(LOCATION.lon).toFixed(3)}°W · ${LOCATION.timezone}`;
  setStatus("loading", "Fetching live data from Open-Meteo…");

  try {
    const [marine, weather] = await Promise.all([
      fetchJSON(MARINE_URL),
      fetchJSON(WEATHER_URL),
    ]);
    HOURS = mergeData(marine, weather);
    if (!HOURS.length) throw new Error("No hourly data returned");

    DAYS = [...new Set(HOURS.map((h) => h.day))];
    activeDay = dayKey(new Date());
    if (!DAYS.includes(activeDay)) activeDay = DAYS[0];

    renderCurrent();
    renderDayNav();
    renderDay(activeDay);

    const updated = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    setStatus("ok", `Live data · updated ${updated} (local time, ${LOCATION.timezone})`);
  } catch (err) {
    console.error(err);
    setStatus("err", `Could not load data: ${err.message}. Check your connection and reload.`);
  }
}

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/* Merge the two Open-Meteo responses on their shared hourly time axis. */
function mergeData(marine, weather) {
  const m = marine.hourly || {};
  const w = weather.hourly || {};
  const times = m.time || [];
  const windByTime = new Map();
  (w.time || []).forEach((t, i) => {
    windByTime.set(t, {
      windSpeed: w.wind_speed_10m?.[i],
      windDir: w.wind_direction_10m?.[i],
    });
  });

  return times.map((t, i) => {
    const wind = windByTime.get(t) || {};
    const d = new Date(t);
    return {
      time: t,
      date: d,
      day: t.slice(0, 10),
      hour: d.getHours(),
      tide: numOrNull(m.sea_level_height_msl?.[i]),
      wave: numOrNull(m.wave_height?.[i]),
      windSpeed: numOrNull(wind.windSpeed),
      windDir: numOrNull(wind.windDir),
    };
  });
}

function numOrNull(v) {
  return v === null || v === undefined || Number.isNaN(v) ? null : Number(v);
}

/* ---- Current conditions (nearest hour to now) ---- */
function renderCurrent() {
  const now = Date.now();
  let cur = HOURS[0];
  let best = Infinity;
  for (const h of HOURS) {
    const diff = Math.abs(h.date.getTime() - now);
    if (diff < best) { best = diff; cur = h; }
  }

  $("curTide").textContent = fmt(cur.tide, 2);
  $("curWind").textContent = fmt(cur.windSpeed, 0);
  $("curWave").textContent = fmt(cur.wave, 2);

  if (cur.windDir != null) {
    $("curWindDir").textContent = `${compass(cur.windDir)} (${Math.round(cur.windDir)}°)`;
    // Arrow points in the direction the wind is blowing TO.
    $("curWindArrow").style.transform = `rotate(${cur.windDir}deg)`;
  }

  // Tide trend vs next hour
  const idx = HOURS.indexOf(cur);
  const next = HOURS[idx + 1];
  if (next && cur.tide != null && next.tide != null) {
    const rising = next.tide > cur.tide;
    $("curTideTrend").textContent = rising ? "rising ▲" : "falling ▼";
  }

  if (cur.wave != null) {
    $("curWaveSub").textContent = `${waveWord(cur.wave)} · significant height`;
  }
}

/* ---- Day navigation ---- */
function renderDayNav() {
  const nav = $("dayNav");
  nav.innerHTML = "";
  const today = dayKey(new Date());
  DAYS.forEach((day) => {
    const btn = document.createElement("button");
    btn.className = "day-btn" + (day === activeDay ? " active" : "");
    btn.textContent = day === today ? "Today" : dayLabel(day);
    btn.addEventListener("click", () => {
      activeDay = day;
      document.querySelectorAll(".day-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      renderDay(day);
    });
    nav.appendChild(btn);
  });
}

function renderDay(day) {
  const rows = HOURS.filter((h) => h.day === day);
  drawTideChart(rows);
  renderTable(rows);
  const tides = rows.map((r) => r.tide).filter((v) => v != null);
  if (tides.length) {
    $("tideRange").textContent =
      `low ${Math.min(...tides).toFixed(2)} m · high ${Math.max(...tides).toFixed(2)} m`;
  } else {
    $("tideRange").textContent = "";
  }
}

/* ---- Hourly table ---- */
function renderTable(rows) {
  const body = $("hourlyBody");
  body.innerHTML = "";
  const nowHour = new Date().getHours();
  const today = dayKey(new Date());
  const maxWave = Math.max(0.1, ...rows.map((r) => r.wave ?? 0));

  rows.forEach((r) => {
    const tr = document.createElement("tr");
    if (r.day === today && r.hour === nowHour) tr.className = "now";

    const barW = r.wave != null ? Math.round((r.wave / maxWave) * 60) : 0;
    tr.innerHTML = `
      <td>${String(r.hour).padStart(2, "0")}:00</td>
      <td>${fmt(r.tide, 2)}</td>
      <td>
        <span class="wind-cell">
          <span class="wind-arrow" style="transform:rotate(${r.windDir ?? 0}deg)">↑</span>
          <span>${fmt(r.windSpeed, 0)} km/h</span>
          <span class="dir-label">${r.windDir != null ? compass(r.windDir) : ""}</span>
        </span>
      </td>
      <td>${fmt(r.wave, 2)}<span class="bar" style="width:${barW}px"></span></td>
    `;
    body.appendChild(tr);
  });
}

/* ---- Tide line chart (custom canvas, no dependencies) ---- */
function drawTideChart(rows) {
  const canvas = $("tideChart");
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 800;
  const cssH = 220;
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const pts = rows.filter((r) => r.tide != null);
  if (pts.length < 2) return;

  const padL = 40, padR = 16, padT = 16, padB = 28;
  const w = cssW - padL - padR;
  const h = cssH - padT - padB;

  const vals = pts.map((p) => p.tide);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (max - min < 0.2) { const m = (min + max) / 2; min = m - 0.2; max = m + 0.2; }
  const pad = (max - min) * 0.12;
  min -= pad; max += pad;

  const x = (i) => padL + (i / (pts.length - 1)) * w;
  const y = (v) => padT + (1 - (v - min) / (max - min)) * h;

  // Grid + Y labels
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.fillStyle = "#8fb6cf";
  ctx.font = "11px system-ui, sans-serif";
  ctx.lineWidth = 1;
  for (let g = 0; g <= 4; g++) {
    const val = min + (g / 4) * (max - min);
    const gy = y(val);
    ctx.beginPath();
    ctx.moveTo(padL, gy);
    ctx.lineTo(cssW - padR, gy);
    ctx.stroke();
    ctx.fillText(val.toFixed(1), 6, gy + 3);
  }

  // X labels (every 3h)
  ctx.textAlign = "center";
  pts.forEach((p, i) => {
    if (p.hour % 3 === 0) ctx.fillText(`${String(p.hour).padStart(2, "0")}h`, x(i), cssH - 8);
  });
  ctx.textAlign = "start";

  // Area fill
  const grad = ctx.createLinearGradient(0, padT, 0, padT + h);
  grad.addColorStop(0, "rgba(58,160,255,0.35)");
  grad.addColorStop(1, "rgba(58,160,255,0.02)");
  ctx.beginPath();
  ctx.moveTo(x(0), y(pts[0].tide));
  pts.forEach((p, i) => ctx.lineTo(x(i), y(p.tide)));
  ctx.lineTo(x(pts.length - 1), padT + h);
  ctx.lineTo(x(0), padT + h);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
  ctx.beginPath();
  ctx.moveTo(x(0), y(pts[0].tide));
  pts.forEach((p, i) => ctx.lineTo(x(i), y(p.tide)));
  ctx.strokeStyle = "#3aa0ff";
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // "Now" marker
  const today = dayKey(new Date());
  const nowHour = new Date().getHours();
  const ni = pts.findIndex((p) => p.day === today && p.hour === nowHour);
  if (ni >= 0) {
    ctx.beginPath();
    ctx.arc(x(ni), y(pts[ni].tide), 5, 0, Math.PI * 2);
    ctx.fillStyle = "#2bd9c4";
    ctx.fill();
    ctx.strokeStyle = "#042032";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

/* ---- Helpers ---- */
function compass(deg) { return COMPASS[Math.round(deg / 22.5) % 16]; }

function waveWord(m) {
  if (m < 0.3) return "Flat";
  if (m < 0.6) return "Small";
  if (m < 1.0) return "Knee–waist high";
  if (m < 1.5) return "Chest high";
  if (m < 2.5) return "Overhead";
  return "Big";
}

function fmt(v, dp) { return v == null ? "—" : v.toFixed(dp); }
function dayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function dayLabel(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric" });
}

function setStatus(kind, text) {
  const dot = $("statusDot");
  dot.className = "dot" + (kind === "ok" ? " ok" : kind === "err" ? " err" : "");
  $("statusText").textContent = text;
}

window.addEventListener("resize", () => {
  if (activeDay) drawTideChart(HOURS.filter((h) => h.day === activeDay));
});
