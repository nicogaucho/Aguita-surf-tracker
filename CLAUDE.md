# CLAUDE.md — Agüita Surf Tracker

Context for AI coding agents. Read this first, then the files it points to.

## What this is

A full-stack PWA that shows live surf conditions (tide, wind, waves) for **La Cícer
Beach** (Las Palmas de Gran Canaria) and sends a **Web Push notification** when it's a
good time to surf. Users sign in with Google or email and get a once-a-day alert.

It started as a static 3-file page (still in [`legacy/`](legacy/)) and was rebuilt as a
Next.js app. The original logic (Open-Meteo fetch + merge, wave wording) was ported into
[`lib/surf.ts`](lib/surf.ts).

**Live:** https://aguita-surf-tracker.vercel.app · **Repo:** github.com/nicogaucho/Aguita-surf-tracker

## Stack

- **Next.js 15** (App Router, TypeScript, React 19) — deployed on **Vercel**.
- **Supabase** — Auth (Google OAuth + email magic-link) + Postgres with RLS. Clients via `@supabase/ssr`.
- **Web Push** — `web-push` (VAPID) server-side; service worker [`public/sw.js`](public/sw.js) client-side. No app store.
- **Vercel Cron** — daily trigger of the surf-check endpoint.
- **Data** — [Open-Meteo](https://open-meteo.com) Marine + Forecast APIs (free, no key).

## Commands

```bash
npm run dev         # local dev (http://localhost:3000)
npm run build       # production build — run a CLEAN build (rm -rf .next) before pushing;
                    # Vercel builds from scratch and catches issues local caches hide
npm run test:surf   # unit tests for the low-tide scoring logic (node --test)
```

There is no separate lint/typecheck step in CI; `next build` does typechecking and ESLint.

## Architecture / data flow

```
PWA (Next.js) ──auth──> Supabase Auth (Google + email)
   │ service worker (push)        │
   ▼                              ▼
 API routes  ───────────>  Supabase Postgres (RLS)
   ▲                              ▲ service role (cron only)
   │ Vercel Cron (05:00 UTC daily)│
   └─ /api/cron/check-surf ─> Open-Meteo ─> scoreDay() ─> web-push ─> 📱
```

## Key files

| Area | File | Notes |
|---|---|---|
| **Surf logic (shared)** | [`lib/surf.ts`](lib/surf.ts) | `fetchConditions`, `mergeData`, `lowTideIndices`, **`scoreDay`** (the rule), `windowMessage` (notification text), `DEFAULT_PREFS`. Used by both client and cron. |
| Surf tests | [`lib/surf.test.ts`](lib/surf.test.ts) | Low-tide scoring cases. Keep these passing. |
| Dashboard | [`app/components/Dashboard.tsx`](app/components/Dashboard.tsx) | Client component; cards, day nav, table, surf banner. |
| Tide chart | [`app/components/TideChart.tsx`](app/components/TideChart.tsx) | Canvas, no deps. Marks low-tide minima + shades the good-surf window. |
| Header | [`app/components/SiteHeader.tsx`](app/components/SiteHeader.tsx) | Brand logo + `right` slot for auth-aware actions. |
| Cron (core) | [`app/api/cron/check-surf/route.ts`](app/api/cron/check-surf/route.ts) | Fetch → per-user `scoreDay` → `web-push` → log. Auth via `CRON_SECRET`. |
| Push store | [`app/api/push/subscribe/route.ts`](app/api/push/subscribe/route.ts), [`unsubscribe`](app/api/push/unsubscribe/route.ts) | Save/remove the caller's subscription. |
| Preferences | [`app/api/preferences/route.ts`](app/api/preferences/route.ts) | GET/PUT `surf_preferences`. |
| Settings UI | [`app/settings/SettingsClient.tsx`](app/settings/SettingsClient.tsx) | Enable notifications + preferences form. |
| Auth callback | [`app/auth/callback/route.ts`](app/auth/callback/route.ts) | Exchanges OAuth/magic-link code for a session. |
| Push wrapper | [`lib/push.ts`](lib/push.ts) | `sendPush` (returns `gone` for 404/410 → delete sub). |
| Supabase clients | [`lib/supabase/`](lib/supabase/) | `client` (browser), `server` (SSR cookies), `admin` (service role, cron), `env` (graceful no-config). |
| Session gate | [`middleware.ts`](middleware.ts) | Refreshes session, redirects anon `/settings` → `/login`. |
| DB schema | [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) | Tables, RLS, signup trigger (creates profile + default prefs). |
| Cron schedule | [`vercel.json`](vercel.json) | `0 5 * * *` (05:00 UTC ≈ 06:00 Canary). |

## The surf rule (what triggers a notification)

In `scoreDay` ([`lib/surf.ts`](lib/surf.ts)). An hour is "good surf" when **all** hold, using
the user's saved `surf_preferences` (cron reads them per user, not the defaults):

1. **Wave** `minWaveM ≤ wave ≤ maxWaveM` (default 0.5–1.5 m).
2. **Low tide** — the hour is within `lowTideWindowH` of a tide minimum (default 1.5).
3. **Wind** `wind < maxWindKmh` (default 18 km/h).
4. **Daylight** `hourStart ≤ hour ≤ hourEnd` (default 7–20).

A notification is sent only if: `enabled = true`, ≥1 good window today, the user has a push
subscription, and they were **not already notified today** (anti-spam via `notifications_log`,
one per `(user_id, day)`).

Defaults are kept in sync in **two places** — `DEFAULT_PREFS` in [`lib/surf.ts`](lib/surf.ts)
and the column defaults in the [migration](supabase/migrations/0001_init.sql). Change both together.

## Database (Supabase Postgres, RLS on)

- `profiles` — one per auth user.
- `surf_preferences` — per-user thresholds (PK `user_id`). Auto-created on signup by a trigger.
- `push_subscriptions` — one row per device (`endpoint` unique).
- `notifications_log` — anti-spam, unique `(user_id, day)`.

Users can only read/write their own rows (RLS); the cron uses the **service role key** (bypasses RLS).

## Conventions & brand

- **Design system: Agüita** (light theme). Tokens + components live in [`app/globals.css`](app/globals.css).
  Sea-blue `#5184a8` primary, sunset-orange `#e27f1e` CTA/accent, sand/gray neutrals, soft shadows,
  pill buttons, 8px spacing. Self-hosted fonts in `public/fonts/` (Avocado Cake display + Helvetica Neue UI).
- **Voice:** lowercase headlines (display font), English UI copy, no emoji in product chrome
  (the push *title* is an exception the user set intentionally).
- **Notification text:** edit `windowMessage` in [`lib/surf.ts`](lib/surf.ts); `public/sw.js` only holds fallbacks.
- TypeScript strict; path alias `@/*` → repo root.
- Number inputs in Settings are kept as **strings while editing** (so fields can be cleared),
  parsed to numbers on save — don't revert to `Number(e.target.value)` in onChange.

## Environment variables

See [`.env.example`](.env.example). Local values live in `.env.local` (gitignored). On Vercel,
the same vars are set in project settings.

- `NEXT_PUBLIC_SUPABASE_URL` — **base** project URL only (no `/rest/v1/` suffix — a past mistake).
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-only).
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` = `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.
- `CRON_SECRET` — Vercel auto-sends it as `Authorization: Bearer` to the cron; the route also
  accepts `?secret=` for manual testing.
- **Never** put Google OAuth client id/secret in env or any tracked file — they go in the
  Supabase dashboard only.

## Testing notifications

```bash
# Manually trigger the cron (sends real push if a window exists for an enabled, subscribed user):
curl "https://aguita-surf-tracker.vercel.app/api/cron/check-surf?secret=$CRON_SECRET"
# Response: { ok, day, candidates, usersNotified, pushSent, expiredRemoved }
```

Conditions are weather-dependent: if waves exceed `maxWaveM` or wind exceeds `maxWindKmh` at the
day's low tide, no window fires (this is correct, not a bug). The anti-spam log blocks a second
send the same day.

## Gotchas / lessons

- **Clean build before pushing.** Local `.next` cache has hidden prerender errors (e.g. a missing
  `<Suspense>` around `useSearchParams`) that only surface on Vercel's fresh build.
- **iOS PWA:** the Home Screen icon comes from `apple-touch-icon` (180×180, **opaque**), not the
  manifest. Transparent logos render on black. iOS caches the icon — re-add to Home to refresh.
- **`@supabase/ssr` cookie callbacks** need explicit `CookieOptions` types or the build fails on
  implicit `any`.
- **Timezone:** Open-Meteo returns naive local-time strings; the server reads the literal hour, so
  `r.hour`/`day` are Canary-local. The 05:00 UTC cron lands on the same calendar day — fine.
- `low_tide_window_h` operates on hourly integer indices, so 1.5 behaves as ~±1 hour.

## Known not-yet-wired / ideas

- `notify_hour` is stored in `surf_preferences` but **not used** — the cron runs once daily for
  everyone. Per-user send timing would be the natural next feature.
- No OG/`metadataBase` for social previews.
- No second (midday) cron check; easy to add in `vercel.json`.
