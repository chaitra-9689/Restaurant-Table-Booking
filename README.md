# Restaurant Table Booking & CRM

Public booking website + staff CRM, backed by Supabase (Postgres, Auth, Realtime).

## Run

```bash
npm install
npm run db:migrate   # applies supabase/migrations/*.sql (idempotent)
npm start            # http://localhost:3000  ·  CRM at /crm
```

`.env` needs `SUPABASE_URL` and `SUPABASE_ANON_KEY` for the browser, plus
`SUPABASE_ACCESS_TOKEN` / `SUPABASE_PROJECT_REF` for `db:migrate`.

## Deploy

Live at **https://restaurant-table-booking-omega.vercel.app** (Vercel project `restaurant-table-booking`).

`npm run build` writes a static copy to `dist/` with a generated `config.js` (Supabase URL + anon key only)
and a `vercel.json` (clean URLs, `/crm` rewrite, supabase-js from jsDelivr, security headers).
Deploy the contents of `dist/` as a static site with no build step, e.g. `cd dist && npx vercel --prod`.
Supabase Auth's Site URL / redirect allow-list point at the live domain plus `http://localhost:3000`.

## Automated testing

```bash
npm run test:e2e                                   # against the live site
E2E_BASE_URL=http://localhost:3000 npm run test:e2e  # against the local server
```

30 Playwright end-to-end tests (website + CRM + security) run in one browser session and produce
`TEST_CASES.md`, `Test_Report.xlsx`, screenshots in `testing_ss/` and an MP4 of the whole run in
`testing_recording/`. Test cases live in `tests/test-cases.js`. The suite creates a temporary admin
(`e2e-admin@e2e.test`, password in `.env`) and removes all test data and restores settings afterwards.

## First login

Open `/crm` → **Create an account**. The first account becomes **admin**; further staff
must be invited from **Staff** and then sign up with the invited email.
If email confirmation is enabled in Supabase (Auth → Providers → Email), confirm the email first.

## Structure

| Path | Purpose |
|---|---|
| `server.js` | Express static server; exposes browser-safe config at `/config.js` |
| `public/index.html`, `js/site.js` | Website: hero, about, menu, live availability booking, hours |
| `public/manage.html` | Guests look up / cancel with reference + email |
| `public/crm/` | CRM: dashboard, bookings, customers, tables, menu, site & booking settings, staff |
| `supabase/migrations/` | Schema, RLS, booking RPCs, seed data |

## How bookings work

- `get_available_slots(date, party)` returns start times inside opening hours where a table fits.
- `create_booking(...)` validates, serialises per-date with an advisory lock, assigns the smallest
  free table and upserts the customer (matched by email, then phone).
- A trigger rejects any overlapping active booking on the same table (covers staff edits too).
- Anonymous users can only call those RPCs and read `site_settings` / visible `menu_items`;
  everything else is staff-only through RLS.
