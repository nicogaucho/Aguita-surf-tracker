"use client";

import { useEffect, useRef } from "react";
import {
  type HourRecord,
  type SurfWindow,
  lowTideIndices,
  dayKey,
} from "@/lib/surf";

/**
 * Daily tide line chart (custom canvas, no dependencies) — ported from the
 * legacy app.js drawTideChart, extended with:
 *   · low-tide minima markers (the surf-relevant moment), and
 *   · shading of the "good surf" window(s) for the day.
 */
export default function TideChart({
  rows,
  windows,
}: {
  rows: HourRecord[];
  windows: SurfWindow[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const draw = () => drawTideChart(canvasRef.current, rows, windows);
    draw();
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, [rows, windows]);

  const pts = rows.filter((r) => r.tide != null);
  if (pts.length < 2) {
    return <div className="chart-empty">No tide data for this day.</div>;
  }

  return (
    <>
      <div className="chart-wrap">
        <canvas ref={canvasRef} height={220} role="img" aria-label="Hourly tide chart with low-tide and surf window markers" />
      </div>
      <div className="chart-legend">
        <span><i className="swatch line" /> Tide (m)</span>
        <span><i className="swatch low" /> Low tide</span>
        <span><i className="swatch window" /> Good surf window</span>
      </div>
    </>
  );
}

function drawTideChart(
  canvas: HTMLCanvasElement | null,
  rows: HourRecord[],
  windows: SurfWindow[],
) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

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

  const vals = pts.map((p) => p.tide as number);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (max - min < 0.2) { const m = (min + max) / 2; min = m - 0.2; max = m + 0.2; }
  const pad = (max - min) * 0.12;
  min -= pad; max += pad;

  const x = (i: number) => padL + (i / (pts.length - 1)) * w;
  const y = (v: number) => padT + (1 - (v - min) / (max - min)) * h;

  // Surf-window shading (drawn first, behind everything).
  const hourToIdx = new Map<number, number>();
  pts.forEach((p, i) => hourToIdx.set(p.hour, i));
  ctx.fillStyle = "rgba(43, 217, 196, 0.18)";
  for (const win of windows) {
    const i0 = hourToIdx.get(win.startHour);
    const i1 = hourToIdx.get(win.endHour);
    if (i0 == null || i1 == null) continue;
    const xa = x(Math.max(0, i0 - 0.5));
    const xb = x(Math.min(pts.length - 1, i1 + 0.5));
    ctx.fillRect(xa, padT, xb - xa, h);
  }

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
  ctx.moveTo(x(0), y(pts[0].tide as number));
  pts.forEach((p, i) => ctx.lineTo(x(i), y(p.tide as number)));
  ctx.lineTo(x(pts.length - 1), padT + h);
  ctx.lineTo(x(0), padT + h);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
  ctx.beginPath();
  ctx.moveTo(x(0), y(pts[0].tide as number));
  pts.forEach((p, i) => ctx.lineTo(x(i), y(p.tide as number)));
  ctx.strokeStyle = "#3aa0ff";
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Low-tide minima markers
  const lows = lowTideIndices(pts);
  ctx.fillStyle = "#ffd166";
  for (const li of lows) {
    ctx.beginPath();
    ctx.arc(x(li), y(pts[li].tide as number), 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#042032";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // "Now" marker
  const today = dayKey(new Date());
  const nowHour = new Date().getHours();
  const ni = pts.findIndex((p) => p.day === today && p.hour === nowHour);
  if (ni >= 0) {
    ctx.beginPath();
    ctx.arc(x(ni), y(pts[ni].tide as number), 5, 0, Math.PI * 2);
    ctx.fillStyle = "#2bd9c4";
    ctx.fill();
    ctx.strokeStyle = "#042032";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}
