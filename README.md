# Agüita Surf 🌊

Web app full-stack che mostra le condizioni (marea, vento, onde) di **La Cícer Beach**
(Las Palmas de Gran Canaria) e invia una **notifica push sullo smartphone** quando è un
buon momento per fare surf.

- **Frontend + API**: Next.js (App Router, TypeScript) — deploy su Vercel.
- **Auth + DB**: Supabase (Google OAuth + email magic-link, Postgres con RLS).
- **Notifiche**: PWA + Web Push (VAPID) — nessuno store, installabile dal browser.
- **Scheduler**: Vercel Cron (check giornaliero).
- **Dati**: [Open-Meteo](https://open-meteo.com) Marine + Forecast API (gratis, senza chiave).

La versione statica originale è conservata in [`legacy/`](legacy/).

## Logica "buon surf" (default, configurabile per utente)

Un'ora è buona quando: **onda 0.5–1.5 m**, **vicina alla bassa marea** (±1.5 h da un
minimo della curva di marea), vento < 18 km/h, ore 07–20. Le soglie vivono in
`surf_preferences` (default a livello DB) e sono modificabili da `/settings`.

## Setup locale

1. **Installa le dipendenze**
   ```bash
   npm install
   ```

2. **Genera le chiavi VAPID**
   ```bash
   npx web-push generate-vapid-keys --json
   ```

3. **Crea `.env.local`** (parti da [`.env.example`](.env.example)) con le chiavi Supabase,
   le VAPID (`NEXT_PUBLIC_VAPID_PUBLIC_KEY` = `VAPID_PUBLIC_KEY` = publicKey) e un
   `CRON_SECRET` casuale.

4. **Supabase**: crea un progetto, esegui la migration
   [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) nel SQL Editor,
   e in *Authentication → Providers* abilita **Google** (Client ID/Secret dalla Google Cloud
   Console) ed **Email**. Aggiungi `http://localhost:3000/auth/callback` e l'URL di produzione
   alle *Redirect URLs*.

5. **Avvia**
   ```bash
   npm run dev
   ```

## Verifica

- **Logica surf** (unit test bassa marea): `npm run test:surf`
- **Dashboard**: apri `/` — marea/vento/onde live + grafico con bassa marea evidenziata.
- **Push manuale** (forza l'invio senza aspettare il cron):
  ```bash
  curl "http://localhost:3000/api/cron/check-surf?secret=$CRON_SECRET"
  ```
  Dopo aver fatto login e attivato le notifiche da `/settings`. Se ci sono finestre buone
  oggi arriva la notifica; un secondo invio nello stesso giorno è bloccato (anti-spam).

## Deploy in produzione (Vercel)

1. `git init && git add -A && git commit` → push su GitHub.
2. Importa il repo su **Vercel**, imposta tutte le env di `.env.example` (incluso
   `CRON_SECRET`: Vercel lo invia automaticamente come `Authorization: Bearer` al cron).
3. Il cron in [`vercel.json`](vercel.json) gira ogni giorno alle **05:00 UTC** (≈ 06:00 ora
   Canarie). Modifica lo `schedule` per cambiare orario o aggiungere check.
4. Aggiungi l'URL di produzione `/auth/callback` alle Redirect URLs di Supabase e Google.

> **iPhone**: le notifiche Web Push richiedono iOS 16.4+ con l'app aggiunta alla Home
> (Safari → Condividi → Aggiungi a Home). Su Android Chrome funzionano direttamente.
