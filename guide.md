# Splex — Build Prompt (v1, Web)

> Paste everything below into your coding agent (Claude Code, Cursor, etc.). Fill in the two Supabase values in Step 0 first.

---

Build **Splex**, a trip expense splitting web app. This is v1 — web only, but the codebase must be structured so iOS and Android ship later from the same source without a rewrite.

## Stack (do not substitute)

- **Expo (SDK 51+) with Expo Router**, targeting **web** via `react-native-web`. Native targets stay configured but untested for now.
- **TypeScript**, strict mode on.
- **Supabase** for Postgres, auth, and file storage.
- **Zustand** for client state, **TanStack Query** for server state.
- **FX rates:** primary source `fawazahmed0/currency-api` via jsDelivr CDN (free, no key, 200+ currencies including VND/KHR/LAK). Fallback to **Frankfurter** (`api.frankfurter.app`, free, no key, ECB daily) if primary fails. Both are keyless — do not introduce a paid provider.
- Deploy target: static web build. Configure as an installable PWA (manifest, icons, service worker).

Do not add a UI component library. Build a small set of primitives (`Button`, `Input`, `Card`, `Sheet`, `Avatar`) in `components/ui/` and use them everywhere.

## Step 0 — Setup

```
SUPABASE_URL = <fill in>
SUPABASE_ANON_KEY = <fill in>
```

Scaffold the Expo project, wire up Supabase, confirm web dev server runs, then stop and report before writing features.

## Data model

Create these as SQL migrations in `supabase/migrations/`. All money is **integer cents**. All ids are `uuid` with `gen_random_uuid()` defaults. All tables get `created_at timestamptz default now()`.

**users** — mirrors `auth.users`; `id` (FK to auth.users), `email`, `display_name`, `avatar_url`

**trips** — `id`, `name`, `created_by` → users, `base_currency` (char(3), default 'USD'), `invite_code` (text, unique, 8-char nanoid), `archived_at` (nullable)

**trip_members** — `id`, `trip_id` → trips, `user_id` → users **NULLABLE**, `display_name` (text, required), `role` ('owner' | 'member'), `removed_at` (nullable)

> The nullable `user_id` is deliberate and load-bearing. A member can exist as a bare name with no account. When someone joins via invite link, link their `user_id` onto the existing row rather than creating a duplicate member.

**expenses** — `id`, `trip_id` → trips, `title` (text, required), `amount_cents` (bigint, > 0), `currency` (char(3) — the currency actually spent in), `base_amount_cents` (bigint — `amount_cents` converted to the trip's `base_currency`), `fx_rate` (numeric(20,10) — rate used, 1.0 when currency == base_currency), `fx_rate_date` (date), `fx_source` (text), `category` (text), `paid_by` → trip_members, `expense_date` (date), `receipt_url` (nullable), `notes` (nullable), `created_by` → users, `updated_at`, `deleted_at` (nullable — soft delete only)

**expense_splits** — `id`, `expense_id` → expenses (cascade), `member_id` → trip_members, `share_cents` (bigint — **in the expense's own currency**), `base_share_cents` (bigint — **in the trip's base currency**), `share_type` ('equal' | 'exact' | 'percent' | 'shares'), `share_value` (numeric, nullable — the raw input before conversion to cents)

> Unique constraint on `(expense_id, member_id)`.

**fx_rates** — `id`, `base_currency` (char(3)), `quote_currency` (char(3)), `rate` (numeric(20,10)), `rate_date` (date), `source` (text), `fetched_at`

> Unique constraint on `(base_currency, quote_currency, rate_date)`. This is a **cache**, not a live passthrough — see the FX section.

**currencies** — `code` (char(3), PK), `name`, `symbol`, `decimal_digits` (int, default 2)

> Seed with the full ISO 4217 list. This one is reference data, not test data, so it lives in a migration, not in `seeds/`. Note `decimal_digits`: JPY, KRW, VND have **0**; KWD, BHD have **3**. Your "cents" math must respect this per currency, not assume 100.

**settlements** — `id`, `trip_id`, `from_member` → trip_members, `to_member` → trip_members, `amount_cents`, `note`, `settled_at`, `created_by`

Categories are a fixed enum for v1: `food`, `transport`, `lodging`, `activities`, `groceries`, `shopping`, `other`.

## Invariants — enforce these in code _and_ with DB constraints where possible

1. **`sum(expense_splits.share_cents) == expenses.amount_cents`, always.** Validate before every insert/update. Add a DB trigger that rejects violations.
2. **Never store or cache a balance.** Balances are always derived: `sum(paid) - sum(owed) - sum(settlements)`. Expose as a Postgres view or RPC.
3. **Rounding:** when a split doesn't divide evenly, distribute remainder cents one at a time to members ordered by `trip_members.id`. Deterministic, same result every time. Write a unit test for `$10 / 3` and `$0.01 / 3`.
4. **Money never touches floats.** Parse user input as a string → minor-unit integer. One `money.ts` module owns all parsing, conversion, and formatting, and it takes `decimal_digits` from the `currencies` table — never hardcode a factor of 100.
5. **FX rounding is applied once, at pin time.** Convert each split individually to base currency, then apply the same remainder-distribution rule so `sum(base_share_cents) == base_amount_cents` exactly. Do not convert the total and the shares independently — they will disagree by a cent.
6. **Soft delete only** for expenses. Never hard-delete a row someone's balance depends on.

## Currency and FX — read this section twice

There are **two separate conversions** and they behave differently. Conflating them is the primary failure mode here.

### 1. Ledger conversion — PINNED, never recomputed

When an expense is saved in a currency other than the trip's `base_currency`, fetch the current rate, compute `base_amount_cents` and each `base_share_cents`, and **store them permanently along with `fx_rate`, `fx_rate_date`, and `fx_source`**.

Never recompute these on read. A dinner in Bangkok must cost the same in SGD tomorrow as it did the night it happened. If you recompute live, every member's balance shifts daily with no transaction occurring, and users will correctly conclude the app is broken.

All balance math, all settle-up suggestions, and all debt simplification operate **exclusively on `base_amount_cents` / `base_share_cents`**. The ledger is single-currency internally.

Editing an expense's amount or currency **does** re-pin the rate to the current one. Show a confirmation noting the rate changed. Editing only the title or category must not touch the rate.

### 2. Display conversion — LIVE, purely cosmetic

Independently, the user picks a **display currency** (stored per-user in profile, overridable per trip via a header dropdown). Every monetary figure in the UI is then converted from base currency to display currency at the **latest cached rate**, at render time only. Nothing is persisted.

This is the case in the brief: an amount owed of 3 SGD, viewed with display currency MYR, renders as roughly RM 9.

When display currency ≠ base currency, show a small footer: the rate used, its timestamp, and the note that settlement amounts are authoritative in the base currency. Do not let someone record a settlement in a display currency without showing them the base-currency amount they're actually clearing.

### Fetching and caching

Do **not** call the FX API from the client. Write a Supabase Edge Function `sync-fx-rates` that:

- Fetches all rates against a single pivot currency (USD), derives cross-rates arithmetically, and upserts into `fx_rates`
- Runs on a **cron schedule every 6 hours**, plus on-demand if the newest cached row is older than 12 hours
- On primary-source failure, tries the fallback source, and on total failure **keeps serving the last good cached rows** rather than erroring — record the staleness and surface it in the UI

The client only ever reads `fx_rates`. This keeps you inside free-tier limits regardless of user count, makes rates identical for every member of a trip at a given moment, and means the app still works when the provider is down or the user is offline.

Rates are mid-market reference rates, not what a bank or card issuer charges. State this in the UI footer once.

### Currency selection UI

The amount input has an adjacent currency dropdown listing **all** currencies from the `currencies` table, searchable by code and name. Order it: trip base currency first, then the user's recently-used currencies, then alphabetical. Default to the trip's base currency. Remember the last currency used _per trip_ — someone in Thailand enters THB fifteen times in a row and should not reselect it each time.

## Row Level Security

Enable RLS on every table. Core rule: a user can read/write rows for a trip only if they have a `trip_members` row for that trip with `removed_at is null`. Only `role = 'owner'` can delete a trip or remove members. Write the policies explicitly; do not leave any table with RLS disabled.

## Data access layer

All Supabase calls live behind `lib/repo/` — e.g. `repo.trips.list()`, `repo.expenses.create()`, `repo.balances.forTrip()`. **No component imports the Supabase client directly.** This is non-negotiable; it's what makes the storage layer swappable and the logic testable.

## Screens (Expo Router)

- `/` — trip list (active + archived), create trip
- `/join/[code]` — accept invite; if logged out, sign in first then auto-join
- `/trip/[id]` — expense feed grouped by date, running "you are owed / you owe" header
- `/trip/[id]/expense/new` and `/trip/[id]/expense/[expenseId]` — same form component, create + edit
- `/trip/[id]/members` — add member (name only, or invite by link), remove member
- `/trip/[id]/balances` — per-person net, plus **simplified settle-up suggestions** (minimum number of transfers), and a "record payment" action writing to `settlements`
- `/settings` — profile, sign out

## Expense form behavior

Title, amount, currency, category, date, and **who paid** (single select from trip members) are all required. Split section defaults to **equal across all current members**, with toggles per member to include/exclude. Switching to exact/percent/shares mode shows a live "remaining: $X.XX" indicator and blocks save until it hits zero.

Editing an expense recalculates splits and therefore balances — verify this works and add a test.

## Auth

Supabase email/password plus magic link. A logged-out user hitting an invite link must land back on the join flow after authenticating.

## Seed data

Put seeds in `supabase/seeds/` — **separate from migrations**, never imported by them. Gate execution behind `if (process.env.SEED_ENABLED !== 'true') process.exit(1)`. Add `npm run seed` and `npm run seed:reset`. Document in the README that seeding must never run against production.

## Explicitly out of scope for v1

Do not build: receipt scanning/OCR, recurring expenses, comments, notifications, native builds, historical-rate backfill, crypto. Stub the "Scan receipt" button so it's visibly disabled with a "coming soon" label.

## Tests

Vitest. Cover at minimum:

- Minor-unit parsing/formatting for 2-digit (SGD), 0-digit (JPY, VND), and 3-digit (KWD) currencies
- Equal-split rounding across 2–7 members; `$10 / 3` and `$0.01 / 3`
- Exact/percent split validation
- FX pin: a THB expense on an SGD trip where `sum(base_share_cents) == base_amount_cents`
- **Balance stability:** create a foreign-currency expense, change the cached rate in `fx_rates`, recompute balances, assert they are unchanged. This is the regression test that protects the whole design.
- Display conversion produces expected output without mutating stored values
- Balance calculation with settlements applied; debt simplification

## Working style

Build in this order, stopping to report after each: **(1)** scaffold + auth, **(2)** migrations + RLS + repo layer, **(3)** currencies table + `sync-fx-rates` function + `money.ts` with tests passing, **(4)** trips + members + invite, **(5)** expenses + splits with FX pinning, **(6)** balances + settle-up + display-currency toggle, **(7)** PWA config + deploy.

Step 3 comes before any UI on purpose. Get the money and FX primitives correct and tested in isolation, because every screen after that depends on them.

Do not scaffold beyond the current step. If a requirement here is ambiguous or seems wrong, ask before implementing.
