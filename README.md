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

## Demo dal vivo (workshop) — forzare la notifica in produzione

Per mostrare la notifica agli utenti registrati **indipendentemente dal meteo**, si impostano
soglie permissive nelle preferenze e si lancia il cron di produzione a mano. Solo interfaccia:
nessuna modifica al codice, nessun deploy.

1. **Ogni utente** in `/settings`: attiva il push sul device, poi salva questi valori TEST
   (con *receive surf alerts* ON) — Min wave `0`, Max wave `10`, Low-tide window `24`,
   Max wind `200`, Start hour `0`, End hour `23`. Così ogni ora con dati passa la regola →
   almeno una finestra → la notifica parte.

2. **Lancia il trigger** (dalla root del progetto; legge `CRON_SECRET` da `.env.local`):

   ```bash
   SECRET=$(grep -E '^CRON_SECRET=' .env.local | cut -d= -f2- | tr -d '"'"'"' ')
   curl -s "https://aguita-surf-tracker.vercel.app/api/cron/check-surf?secret=$SECRET" | jq
   ```
   
   > L'assegnazione `SECRET=` deve stare su una **riga separata** dal `curl`, altrimenti la
   > shell espande `$SECRET` prima di valorizzarlo e ottieni `{ "error": "forbidden" }`.

   Demo riuscita: la risposta ha `usersNotified ≥ 1` e `pushSent ≥ 1`.

3. **Re-run nello stesso giorno**: l'anti-spam invia **1 sola notifica per utente al giorno**.
   Per ripetere la demo bisogna prima svuotare il log di oggi. Comando combinato (cancella il
   log via REST con la service role key + ri-triggera), tutto da terminale:

   ```bash
   URL=$(grep '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | cut -d= -f2- | tr -d '"'"'"' ')
   KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d= -f2- | tr -d '"'"'"' ')
   SECRET=$(grep '^CRON_SECRET=' .env.local | cut -d= -f2- | tr -d '"'"'"' ')
   curl -s -X DELETE "$URL/rest/v1/notifications_log?day=eq.$(date +%F)" \
     -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
   curl -s "https://aguita-surf-tracker.vercel.app/api/cron/check-surf?secret=$SECRET" | jq
   ```

   In alternativa, solo lo svuotamento da *Supabase → SQL Editor*:

   ```sql
   delete from public.notifications_log where day = current_date;
   ```

   **Diagnostica** (chi è abilitato, chi ha il push, soglie attive) — utile se `usersNotified`
   resta 0: un utente riceve solo se è `enabled`, ha una **push subscription** e ha **soglie
   permissive** (con i default la notifica dipende dal meteo reale). Un intervallo orario
   invertito (`hour_start > hour_end`) non produce mai finestre.

   ```bash
   curl -s "$URL/rest/v1/surf_preferences?select=user_id,enabled,min_wave_m,max_wave_m,low_tide_window_h,max_wind_kmh,hour_start,hour_end" \
     -H "apikey: $KEY" -H "Authorization: Bearer $KEY" | jq
   curl -s "$URL/rest/v1/push_subscriptions?select=user_id,created_at" \
     -H "apikey: $KEY" -H "Authorization: Bearer $KEY" | jq
   ```

4. **Fine demo — ripristina i default** (in `/settings`, oppure via SQL):
   `0.5` / `1.5` / `1.5` / `18` / `7` / `20`.

## Deploy in produzione (Vercel)

1. `git init && git add -A && git commit` → push su GitHub.
2. Importa il repo su **Vercel**, imposta tutte le env di `.env.example` (incluso
   `CRON_SECRET`: Vercel lo invia automaticamente come `Authorization: Bearer` al cron).
3. Il cron in [`vercel.json`](vercel.json) gira ogni giorno alle **05:00 UTC** (≈ 06:00 ora
   Canarie). Modifica lo `schedule` per cambiare orario o aggiungere check.
4. Aggiungi l'URL di produzione `/auth/callback` alle Redirect URLs di Supabase e Google.

> **iPhone**: le notifiche Web Push richiedono iOS 16.4+ con l'app aggiunta alla Home
> (Safari → Condividi → Aggiungi a Home). Su Android Chrome funzionano direttamente.
