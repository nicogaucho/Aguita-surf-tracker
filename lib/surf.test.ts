import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreDay, lowTideIndices, DEFAULT_PREFS, type HourRecord } from "./surf.ts";

// Build a synthetic day: tide is a V shape with a minimum at hour 10.
// wave/wind/dir are parameterised per test.
function buildDay(opts: {
  waveAt: (hour: number) => number;
  wind?: number;
}): HourRecord[] {
  const { waveAt, wind = 10 } = opts;
  const rows: HourRecord[] = [];
  for (let h = 6; h <= 14; h++) {
    const tide = Math.abs(h - 10) * 0.4; // min (0) at hour 10, rising away
    rows.push({
      time: `2026-06-07T${String(h).padStart(2, "0")}:00`,
      day: "2026-06-07",
      hour: h,
      tide,
      wave: waveAt(h),
      windSpeed: wind,
      windDir: 135,
    });
  }
  return rows;
}

test("low tide minimum is detected at hour 10", () => {
  const day = buildDay({ waveAt: () => 1.0 });
  const lows = lowTideIndices(day);
  // index 4 corresponds to hour 10 (rows start at hour 6).
  assert.ok(lows.includes(4), `expected hour 10 minimum, got ${lows}`);
});

test("good wave only AT low tide → window is reported around hour 10", () => {
  // Wave in range (1.0m) only near the low-tide minimum, flat (out of range) elsewhere.
  const day = buildDay({ waveAt: (h) => (Math.abs(h - 10) <= 1 ? 1.0 : 0.2) });
  const windows = scoreDay(day, DEFAULT_PREFS);
  assert.equal(windows.length, 1);
  assert.equal(windows[0].bestHour, 10);
});

test("good wave only FAR from low tide → no window", () => {
  // Wave in range only at hours 6-7 (far from the hour-10 minimum), flat near low tide.
  const day = buildDay({ waveAt: (h) => (h <= 7 ? 1.0 : 0.2) });
  const windows = scoreDay(day, DEFAULT_PREFS);
  assert.equal(windows.length, 0);
});

test("wave above max (1.5m) is rejected even at low tide", () => {
  const day = buildDay({ waveAt: () => 2.0 });
  const windows = scoreDay(day, DEFAULT_PREFS);
  assert.equal(windows.length, 0);
});

test("strong wind is rejected even with good wave at low tide", () => {
  const day = buildDay({ waveAt: (h) => (Math.abs(h - 10) <= 1 ? 1.0 : 0.2), wind: 30 });
  const windows = scoreDay(day, DEFAULT_PREFS);
  assert.equal(windows.length, 0);
});
