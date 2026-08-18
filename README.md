# Splex

Split trip expenses across currencies without the arithmetic.

Web-first (Expo + `react-native-web`), but the codebase is structured so iOS and
Android ship from the same source later without a rewrite: no web-only APIs
outside `app/+html.tsx` and the service worker, and every screen is built from
React Native primitives.

---

## Quick start

```bash
npm install
cp .env.example .env.local     # fill in your Supabase URL + anon/publishable key
npm run web
```

Then apply the database migrations — the app cannot do anything useful until
the schema and the `currencies` table exist. See [Database setup](#database-setup).

| Command | What it does |
| --- | --- |
| `npm run web` | Dev server at http://localhost:8081 |
| `npm run build:web` | Static web build into `dist/` |
| `npm test` | Vitest suite |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run seed` | Development seed data (guarded — see [Seeding](#seeding)) |

---

## The two things this app gets right

Nearly everything else follows from these.

### 1. Money is never a float

User input is parsed as a **string** straight into an integer number of minor
units, and every conversion runs on `BigInt`. One module — `lib/money.ts` —
owns all parsing, formatting, and conversion.

Critically, the number of minor units per major unit comes from
`currencies.decimal_digits`, never from a hardcoded 100:

| Currency | decimal_digits | 1 major unit = |
| --- | --- | --- |
| SGD, USD, EUR | 2 | 100 minor units |
| JPY, KRW, VND, ISK, XOF | **0** | 1 minor unit |
| KWD, BHD, OMR, TND | **3** | 1000 minor units |
| CLF, UYW | 4 | 10 000 minor units |

Assuming 100 is wrong for roughly a fifth of the world's currencies, and wrong
in a way that only shows up once someone spends yen.

When a split doesn't divide evenly, the remainder is distributed one minor unit
at a time to members **ordered by `trip_members.id`** — deterministic, so every
device computes the same allocation. `$10 / 3` is always `[334, 333, 333]`.

### 2. There are two currency conversions, and they behave differently

Conflating these is the primary failure mode for an app like this.

**Ledger conversion — pinned, never recomputed.** When an expense is saved in a
currency other than the trip's base currency, the rate is fetched once and
`base_amount_cents`, `fx_rate`, `fx_rate_date`, and `fx_source` are stored
permanently, along with a `base_share_cents` for every split.

A dinner in Bangkok must cost the same in SGD tomorrow as it did the night it
happened. If it were recomputed on read, every member's balance would drift
daily with no transaction occurring, and users would correctly conclude the app
is broken. `tests/balances.test.ts` contains the regression test that protects
this: pin an expense, move the cached rate 15%, recompute balances, assert they
are byte-identical.

All balance maths, settle-up suggestions, and debt simplification operate
**exclusively** on `base_amount_cents` / `base_share_cents`. The ledger is
single-currency internally.

Editing an expense's **amount or currency** re-pins to the current rate, and the
UI confirms that first. Editing only the title, category, payer, or split shape
leaves the original pin untouched — see `lib/expense-draft.ts` and its tests.

**Display conversion — live, cosmetic, never persisted.** Independently, a user
picks a display currency (per-profile, overridable per trip from the trip
header). Every figure is converted at render time from the latest cached rate.
Nothing is written back. When the display currency differs from the base
currency, a footer states the rate used, its age, and that settlements are
authoritative in the base currency.

Recording a payment always writes the **base-currency** amount, and the sheet
shows both figures so nobody clears a debt they haven't seen the real value of.

---

## Architecture

```
app/                    Expo Router routes
  _layout.tsx           providers + auth gate
  index.tsx             trip list
  sign-in.tsx           email/password + magic link
  settings.tsx          profile, display currency, sign out
  join/[code].tsx       invite acceptance
  trip/[id]/
    index.tsx           expense feed, grouped by date
    members.tsx         add by name, invite link, remove
    balances.tsx        per-person net, settle-up, record payment
    expense/new.tsx     ─┐ both render the same
    expense/[id].tsx    ─┘ <ExpenseForm />

components/ui/          Button, Input, Card, Sheet, Avatar, Text
components/             CurrencyPicker, ExpenseForm, FxFooter, Screen, …

lib/
  money.ts              parsing, formatting, conversion, remainder distribution
  splits.ts             equal / exact / percent / shares
  fx.ts                 rate resolution, ledger pinning, display conversion
  balances.ts           derivation + debt simplification
  expense-draft.ts      form state -> write payload, incl. the re-pin rules
  repo/                 ALL Supabase access
  queries.ts            TanStack Query bindings over repo
  stores/               Zustand: session, per-device preferences

public/                 copied verbatim into the web build (manifest, sw.js, icons)
scripts/finalize-web.mjs  injects the PWA tags into the exported index.html

supabase/
  migrations/           schema, invariants, views/RPCs, RLS, ISO 4217 seed, cron
  functions/            sync-fx-rates edge function
  seeds/                development data (never imported by migrations)
```

**No component imports the Supabase client.** Every call goes through
`lib/repo/`. `lib/supabase.ts` is the only file that imports
`@supabase/supabase-js`. This is what keeps the storage layer swappable and the
business logic testable without a network — the entire test suite runs against
pure functions, no mocks, no database.

### Invariants, enforced in code *and* in the database

| # | Invariant | Enforced by |
| --- | --- | --- |
| 1 | `sum(share_cents) == amount_cents` (and the same in base currency) | `lib/splits.ts` + deferred constraint trigger `expense_splits_balance_check` |
| 2 | Balances are never stored | `trip_member_balances` view; no balance column exists |
| 3 | Deterministic remainder distribution | `lib/money.ts`, ordered by `trip_members.id` |
| 4 | Money never touches a float | `lib/money.ts` — string parsing, BigInt maths |
| 5 | FX rounding applied once, at pin time | `pinSharesToBase`, verified by trigger |
| 6 | Soft delete only for expenses | **No DELETE policy exists** on `expenses` — a hard delete is impossible for any client |

Expenses and their splits are written through the `create_expense` /
`update_expense` RPCs rather than table inserts, because PostgREST gives every
request its own transaction and invariant 1 has to be checked with the expense
and its splits both present.

### Row Level Security

RLS is enabled on **every** table with explicit policies. The core rule: you can
touch a trip's rows only if you hold a `trip_members` row for that trip with
`removed_at is null`. Only `role = 'owner'` can delete a trip or remove members.

Membership checks go through `SECURITY DEFINER` helpers (`is_trip_member`,
`is_trip_owner`, `can_access_expense`) so that policies on `trip_members` don't
recurse into themselves.

The invite flow uses two `SECURITY DEFINER` RPCs — `trip_preview_by_code` and
`join_trip_by_code` — because someone accepting an invite is by definition not
yet a member and cannot read the trip through RLS.

---

## Database setup

Using the Supabase CLI against a project:

```bash
supabase link --project-ref <your-project-ref>
supabase db push                       # applies supabase/migrations/ in order
supabase functions deploy sync-fx-rates
```

Or paste each file in `supabase/migrations/` into the SQL editor **in filename
order**. The order matters: `20260817000300_views_and_rpcs.sql` defines the
helper functions that `..._400_rls.sql` references.

**Fastest path for a fresh project:** paste `supabase/apply-all.sql` — all six
migrations concatenated in order, plus a `public.users` backfill for any account
created before the trigger existed, and a starter set of USD-pivot FX rates so
foreign-currency expenses can be saved immediately. It is a one-shot script and
errors on a second run rather than half-applying.

That file is generated. `supabase/migrations/` is the source of truth — after
changing a migration, run `npm run bundle:sql` or the bundle silently goes
stale.

### Running the whole stack locally

```bash
npx supabase start     # Postgres, Auth, PostgREST, Storage — migrations auto-apply
npm run seed           # demo trip (needs SEED_ENABLED=true in .env.local)
npm run web
```

`supabase start` prints the local API URL and keys; put them in `.env.local` as
`EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Studio runs at
http://127.0.0.1:54323 and a catch-all mail inbox at http://127.0.0.1:54324.
`npx supabase stop` tears it down; `npx supabase db reset` re-applies every
migration from scratch, which is the quickest way to check a migration change.

> Do not leave commented-out copies of `EXPO_PUBLIC_*` keys in `.env.local`.
> Expo's dotenv parsing has been seen picking them up as live assignments,
> which silently points the app at the wrong backend — a failure that looks
> exactly like a broken database.

Then, once, in the SQL editor, so the 6-hourly cron can authenticate:

```sql
select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
select vault.create_secret('<service-role-key>', 'service_role_key');
```

Finally, in **Authentication → URL Configuration**, add your dev and production
origins as redirect URLs, or magic links and invite links will bounce.

### FX rates

`sync-fx-rates` is the only thing that talks to an FX provider:

- **Primary:** `fawazahmed0/currency-api` via jsDelivr (keyless, 200+ currencies
  including VND, KHR, LAK)
- **Fallback:** Frankfurter (`api.frankfurter.app`, keyless, ECB daily)
- On total failure it writes nothing and keeps serving the last good cached
  rows, and the UI surfaces the staleness rather than erroring

It runs every 6 hours on cron, plus on demand when the newest cached row is
older than 12 hours. The client only ever **reads** `fx_rates` — that keeps the
app inside free-tier limits regardless of user count, makes rates identical for
every member of a trip at a given moment, and means the app still works when the
provider is down.

Rates are mid-market reference rates, not what a bank or card issuer charges.
The UI states this.

---

## Testing

```bash
npm test
```

81 tests, no mocks and no database — everything under test is a pure function.
Coverage matches the brief:

- Minor-unit parsing/formatting for 2-digit (SGD), 0-digit (JPY, VND), and
  3-digit (KWD) currencies
- Equal-split rounding across 2–7 members, including `$10 / 3` and `$0.01 / 3`
- Exact and percent split validation, including the live remaining indicator
- FX pin: a THB expense on an SGD trip where
  `sum(base_share_cents) == base_amount_cents`, plus a VND→KWD case that crosses
  from 0 to 3 decimal digits
- **Balance stability** — the regression test that protects the whole design
- Display conversion produces expected output without mutating stored values
- Balance calculation with settlements applied, and debt simplification
- Editing an expense: title-only edits preserve the pin; amount/currency edits
  re-pin

---

## Seeding

> **Seeding must never run against production.** It creates real auth users and
> real trips, and `--reset` deletes them.

```bash
# in .env.local
SEED_ENABLED=true
SUPABASE_SERVICE_ROLE_KEY=<service role key>
```

```bash
npm run seed          # populate
npm run seed:reset    # delete what this script created, then repopulate
npm run seed:clear    # delete what this script created, and stop
```

`seed:clear` is what to run before handing a database over. It removes seeded
trips, the three `@splex.test` accounts, and the `source = 'seed'` FX rows, and
leaves real accounts alone.

Scope is decided by **ownership**, not by the `[seed]` name prefix. The prefix
only survives until someone renames the trip in the app, and anything created
later while signed in as a seed account never carried it — both were being left
behind, silently, because a query that finds nothing looks identical to one with
nothing to find.

The script refuses to run unless `SEED_ENABLED=true`, and refuses to touch a
hosted `*.supabase.co` project unless `SEED_ALLOW_REMOTE=true` is also set. It
lives in `supabase/seeds/` and is never imported by a migration.

It creates a Bangkok trip with an SGD base currency, three account holders, one
deliberately account-less bare-name member, expenses in THB, JPY and SGD, and
one recorded settlement.

---

## Making a change

Most changes need nothing but a push. The exceptions are worth knowing, because
none of them fail loudly.

| Changed | Do this |
| --- | --- |
| UI or logic — `app/`, `components/`, `lib/` | `npm run typecheck && npm test`, commit, push. Cloudflare rebuilds on its own. |
| Colour tokens — `lib/theme.ts` | Same. The contrast tests gate it: every foreground clears 4.5:1 on its own background **in both palettes**, and both palettes must define identical token sets. |
| Logo — `assets/logo.png` | `node scripts/make-icons.mjs` first, then commit the six regenerated icons alongside it. |
| Database schema | A **new** migration file. Then `npm run bundle:sql`, update `lib/types.ts` by hand, `npx supabase db reset` to prove it applies from scratch, then `npx supabase db push --db-url …` to production. |
| Edge function — `supabase/functions/` | `npx supabase functions deploy sync-fx-rates --project-ref <ref>`. **A git push does not deploy this.** |
| Dependencies | Commit `package-lock.json`. Cloudflare installs from it with `npm ci`, which fails if it has drifted from `package.json`. |
| Supabase URL or key | Three places: `.env.local` (dev), `.env.production.local` (local production build), and the Cloudflare Pages environment. |

CI runs typecheck and the test suite on every push to `main`. Cloudflare deploys
whether or not it passes, so treat a red run as "the deployed app is broken",
not "the deploy was stopped".

### Four things that go wrong quietly

- **`lib/types.ts` is hand-written**, mirroring the SQL. Nothing regenerates it
  and nothing fails when it drifts from the schema — the types simply start
  describing a database that no longer exists.
- **`supabase/apply-all.sql` is a build artifact.** Regenerate it before every
  apply. It sat two migrations behind once and would have shipped a schema with
  no `leave_trip` and no `add_member_by_username` while both were live in the UI.
- **Never edit a migration that has been applied.** `db push` tracks what it ran
  by filename, so an edited one leaves production and the repo permanently
  disagreeing with nothing to notice it. Write a new migration instead.
- **Env values are inlined at bundle time.** `build:web` exports with `--clear`
  because a warm Metro cache re-emitted a bundle still pointing at `127.0.0.1`
  after the environment changed: identical bundle hash, wrong backend, no
  warning. After any env change, check what actually shipped:

  ```bash
  grep -o 'https://[a-z0-9]*\.supabase\.co' dist/_expo/static/js/web/*.js | sort -u
  ```

### Missing `.env.local`

`npm test` does not need one — `.env.test` is committed with placeholder values,
because `lib/supabase.ts` throws at import time without them and several tests
reach it through `lib/repo/`. Running the app still needs `.env.local`.

---

## Deploying

Target: the hosted Supabase project for data, **Cloudflare Pages** for the app.

### 1. Apply the schema

Done for the current project — all 12 migrations are applied. This is the
procedure for a new one, or for pushing later migrations.

```bash
npm run bundle:sql       # regenerate from supabase/migrations/ first
npx supabase db push --db-url "postgresql://postgres:<pwd>@db.<ref>.supabase.co:5432/postgres"
```

Prefer `db push` over pasting `supabase/apply-all.sql`: it records what it ran
in `supabase_migrations.schema_migrations`, so later migrations go up
incrementally instead of re-running the whole bundle. The password must be
percent-encoded — an `@` in it otherwise terminates the userinfo section and
the host parses as garbage. Use `--dry-run` first.

Direct connections to `db.<ref>.supabase.co` are **IPv6-only** without the IPv4
add-on. On a network without IPv6, use the Supavisor pooler host from the
dashboard instead.

**Regenerate before every apply.** The bundle is a build artifact and goes stale
silently: it sat two migrations behind for a while, which would have shipped a
schema with no `leave_trip` and no `add_member_by_username` while both features
were live in the UI.

Verified end to end against a scratch database: 8 tables all with RLS enabled,
24 policies, 60 functions, 172 currencies. If `pg_cron` is unavailable the FX
scheduler degrades to a notice instead of aborting the script — an unguarded
`create extension` there would stop the run partway and leave every later
migration unapplied.

### 2. Point the build at it

`.env.production.local` (gitignored) holds the hosted URL and anon key. Expo's
precedence puts `.env.production.local` above `.env.local`, so `expo export`
uses production while `expo start` keeps using the local stack — nothing is
swapped by hand.

```bash
npm run build:web        # -> dist/
```

The export runs with `--clear`. Env values are inlined at transform time, so a
warm Metro cache will happily re-emit a bundle pointing at `127.0.0.1` even
after the environment changes — identical bundle hash, wrong backend, no
warning. Always confirm what actually shipped:

```bash
grep -o 'https://[a-z0-9]*\.supabase\.co' dist/_expo/static/js/web/*.js | sort -u
```

### 3. Cloudflare Pages

Build command `npm run build:web`, output directory `dist`. Set
`EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in the Pages
environment if building on Cloudflare rather than uploading a local `dist/`.

`scripts/finalize-web.mjs` writes `dist/_redirects` on every build, so SPA
routing survives a rebuild. Without it every route but `/` 404s on refresh —
and only on refresh, which is the kind of bug that passes testing and breaks in
front of someone else.

### 4. Auth redirect URLs

Authentication → URL Configuration, or the Management API. Both fields matter:

| Field | Value |
| --- | --- |
| Site URL | `https://splex.pages.dev` |
| Redirect URLs | `https://splex.pages.dev`, `https://splex.pages.dev/**`, `http://localhost:8081`, `http://localhost:8081/**` |

**An empty allow-list does not produce an error.** Supabase silently discards
the `emailRedirectTo` the app sends and falls back to Site URL — which defaults
to `http://localhost:3000`, where nothing is listening. The confirmation itself
still succeeds server-side, so the account really is verified; only the landing
page 404s. The failure therefore appears in a user's inbox and nowhere a
developer would look. This shipped that way and was caught only by a user
clicking the link.

Both the bare origin and the `/**` form are listed because
`Linking.createURL('/')` strips the trailing slash, so the value actually sent
has no path at all. The `/**` entries cover `/join/<code>` invite redirects.

To confirm a change took, without sending an email: `POST` to
`/auth/v1/admin/generate_link` with a `redirect_to` and read `redirect_to` back
out of the returned `action_link`. If it comes back as Site URL instead of what
was asked for, the origin is not allow-listed.

### 5. FX rates

A fresh project has **no** `fx_rates` rows, so cross-currency conversion has
nothing to work with until either the `sync-fx-rates` function is deployed and
its Vault secrets set (see *FX rates* above), or the client triggers its first
on-demand sync. Same-currency trips are unaffected.

The app is installable: `public/manifest.webmanifest`, maskable icons, and a
service worker that caches the app shell. The service worker deliberately does
**not** cache Supabase traffic — someone acting on a three-day-old cached
balance is exactly the failure this app exists to prevent.

`npm run build:web` runs `scripts/finalize-web.mjs` after the export to inject
the manifest link, Apple meta tags, and service worker registration into
`dist/index.html`. Expo only honours an `app/+html.tsx` shell when
`web.output` is `"static"`; Splex ships as an SPA (`"single"`) because the whole
app is behind auth — prerendering gains nothing, and static rendering would
evaluate the Supabase client in Node at build time. The script is idempotent and
fails loudly if any asset it references is missing.

---

## Out of scope for v1

Receipt scanning/OCR — removed outright, not stubbed, along with the image
picker it needed. Also: recurring expenses, comments, notifications, native
builds, historical-rate backfill, crypto.

Known limits worth stating rather than discovering:

- **Native is dark-theme only.** Theming rides on CSS custom properties; React
  Native has no equivalent, so the token layer would need to become reactive.
- **Category tints are tuned for the dark surface** and reach only 1.4–2.9:1 on
  a light background, so categories are weakly differentiated in light mode.
- **Signup reveals whether an address is already registered.** A deliberate
  trade for a clear error, and it does mean email enumeration. Password recovery
  behaves the opposite way and answers identically either way.
- **Email uses Supabase's built-in SMTP**, which permits only a few sends per
  hour. Configure custom SMTP before real traffic.

## Decisions worth knowing about

- **Claiming an identity on join.** The brief says joining should link a
  `user_id` onto an existing member row rather than duplicating the person. Since
  there is no reliable way to *guess* which bare name is the new arrival, the
  join screen lists unclaimed members and lets them pick, or join as someone new.
- **Cross-rates are materialised only for currencies in use.** Storing every
  pair would be ~40 000 rows per day. `sync-fx-rates` writes the USD-pivot rows
  plus cross-rates for currencies that trips actually use; `lib/fx.ts` derives
  anything else arithmetically at read time.
- **Trip updates are open to all members**, matching the brief's core RLS rule;
  only deletion and member removal are owner-only. Tighten
  `trips_update` if you'd rather renaming and archiving were owner-only too.
- **Amounts are validated, not trusted.** The client computes the FX pin and the
  database verifies the splits are internally consistent. A modified client
  could still submit a rate that never existed. For a trip app among friends
  that is an acceptable trade; moving the pin server-side into `create_expense`
  would close it.
