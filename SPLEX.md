# Splex — project reference

Everything needed to pick this codebase up: what it is, what was built, what
each package is for, why the non-obvious decisions were made, and what is still
outstanding.

For setup and day-to-day commands see [README.md](./README.md). This document is
the *why*.

---

## What Splex is

A trip expense-splitting app. A group creates a trip, logs what each person
paid, and Splex works out who owes whom — across as many currencies as the trip
touches.

Web-first, built with Expo + `react-native-web`, structured so iOS and Android
can ship from the same source later without a rewrite. No web-only APIs exist
outside `scripts/finalize-web.mjs` and `public/sw.js`; every screen is built
from React Native primitives.

**Status:** working end to end against a local Supabase stack. Not deployed.

---

## Stack

| Layer | Choice | Version |
| --- | --- | --- |
| App framework | Expo + Expo Router | `~57.0.13` |
| Runtime | React Native (via `react-native-web`) | `0.86.2` / RNW `^0.21.2` |
| UI runtime | React | `19.2.3` |
| Language | TypeScript, strict | `~6.0.3` |
| Backend | Supabase (Postgres 15, Auth, PostgREST, Edge Functions) | — |
| Server state | TanStack Query | `^5.101.4` |
| Client state | Zustand | `^5.0.15` |
| Tests | Vitest | `^3.2.7` |
| Font | Inter, via `expo-font` | — |

### Why each dependency is here

**Runtime**

- `expo`, `expo-router` — app shell and file-based routing. Routes live in `app/`.
- `react-native-web`, `react-dom` — renders the RN component tree to the DOM.
- `react-native-safe-area-context`, `react-native-screens` — required by Expo Router's navigator.
- `@expo/metro-runtime` — Metro's web runtime (fast refresh, error overlay).
- `@supabase/supabase-js` — the only client for Postgres/Auth. Imported in exactly one file.
- `@tanstack/react-query` — caching, refetch-on-focus, and invalidation after writes.
- `zustand` — two small stores: auth session, and per-device preferences.
- `@react-native-async-storage/async-storage` — persistence for Zustand and Supabase auth on native. On web it wraps `localStorage`.
- `expo-font`, `@expo-google-fonts/inter` — Inter, including real tabular numerals.
- `expo-linking` — builds redirect URLs for magic links and invite links.
- `expo-constants`, `expo-status-bar`, `expo-web-browser`, `expo-crypto` — Expo baseline.

**Dev**

- `vitest` — unit tests. **Pinned to 3.x deliberately**: Vitest 4 uses rolldown, whose native binary has no build for Node 21, which is what this machine runs.
- `tsx` — runs the TypeScript seed script directly.
- `ws` — supplies a `WebSocket` to `supabase-js` in Node. Its constructor demands one even though nothing subscribes, and Node only exposes one globally from v22.
- `@types/node`, `@types/react`, `@types/ws`, `typescript`.

**Deliberately absent**

- No UI component library. `lib/theme.ts` plus `components/ui/` is the entire visual vocabulary.
- No image library (`sharp`, ImageMagick). `scripts/make-icons.mjs` does PNG decode/resize/encode with Node's built-in `zlib`.
- No date library. `lib/dates.ts` is ~80 lines of ISO-date helpers.
- `expo-image-picker` was installed for the Scan Receipt stub and **removed** when that feature was cut.

---

## Layout

```
app/                       routes (Expo Router)
  _layout.tsx              providers, font loading, auth gate, NavBar
  index.tsx                Home
  trips.tsx                My Trips  (?new=1 opens the create sheet)
  about.tsx                About
  settings.tsx             profile, display currency, sign out
  sign-in.tsx              email/password + magic link
  join/[code].tsx          invite acceptance
  trip/[id]/
    index.tsx              expense feed grouped by date
    members.tsx            add by name, invite link, remove
    balances.tsx           per-person net, settle-up, record payment
    expense/new.tsx        ┐ both render <ExpenseForm />
    expense/[expenseId].tsx┘

components/ui/             Button Card Input Sheet Avatar Text Select DateField
components/                NavBar CreateTripSheet TripCard ExpenseForm
                           CurrencyPicker DisplayCurrencyToggle FxFooter Screen Logo

lib/
  money.ts                 parsing, formatting, conversion, remainder distribution
  splits.ts                equal / exact / percent / shares
  fx.ts                    rate resolution, ledger pinning, display conversion
  balances.ts              derivation + debt simplification
  expense-draft.ts         form state -> write payload, incl. re-pin rules
  dates.ts                 ISO date helpers + calendar grid
  theme.ts                 design tokens
  repo/                    ALL Supabase access
  queries.ts               TanStack Query bindings over repo
  stores/                  session, prefs

scripts/
  bundle-sql.mjs           migrations -> supabase/apply-all.sql
  finalize-web.mjs         injects PWA tags into the exported index.html
  make-icons.mjs           all icon sizes from assets/logo.png

supabase/
  migrations/              10 files, applied in filename order
  functions/sync-fx-rates/ the only thing that talks to an FX provider
  seeds/run.ts             dev data, guarded
```

**53 source files** in `app/` + `components/` + `lib/`. **81 tests**, 5 files.

---

## The two ideas the design rests on

Almost every other decision follows from these.

### 1. Money is never a float

User input is parsed as a **string** straight into an integer number of minor
units; all conversion runs on `BigInt`. `lib/money.ts` owns this exclusively.

Minor units per major unit come from `currencies.decimal_digits`, never a
hardcoded 100 — it is 0 for JPY/KRW/VND/ISK/XOF, 2 for most, 3 for
KWD/BHD/OMR/TND, 4 for CLF/UYW. Assuming 100 is wrong for roughly a fifth of
the world's currencies, and only shows up once someone spends yen.

Uneven splits distribute the remainder one minor unit at a time in
`trip_members.id` order, so every device computes the same allocation.
`$10 / 3` is always `[334, 333, 333]`.

### 2. There are two currency conversions and they behave differently

**Ledger conversion — pinned, never recomputed.** When an expense is saved in a
non-base currency, the rate is fetched once and `base_amount_cents`, `fx_rate`,
`fx_rate_date`, `fx_source` and every `base_share_cents` are stored
permanently.

A dinner in Bangkok must cost the same in SGD tomorrow as it did the night it
happened. Recompute on read and every member's balance drifts daily with no
transaction occurring. `tests/balances.test.ts` pins an expense, moves the
cached rate ~15%, recomputes, and asserts the balances are identical — it also
asserts the rate genuinely changed, so it cannot pass vacuously.

**Display conversion — live, cosmetic, never persisted.** A display currency
(per profile, overridable per trip) converts figures at render time only. When
it differs from the base currency a footer states the rate, its age, and that
settlements are authoritative in the base currency. Recording a payment always
writes the **base-currency** amount, and the sheet shows both figures.

Editing an expense's **amount or currency** re-pins to the current rate, with a
confirmation. Editing title, category, payer or split shape does not — see
`lib/expense-draft.ts` and its tests.

---

## Invariants

| # | Invariant | Enforced by |
| --- | --- | --- |
| 1 | `sum(share_cents) == amount_cents`, and the same in base currency | `lib/splits.ts` + deferred constraint trigger `expense_splits_balance_check` |
| 2 | Balances are never stored | `trip_member_balances` view; no balance column exists |
| 3 | Deterministic remainder distribution | `lib/money.ts`, ordered by `trip_members.id` |
| 4 | Money never touches a float | `lib/money.ts` — string parsing, BigInt maths |
| 5 | FX rounding applied once, at pin time | `pinSharesToBase`, verified by the trigger |
| 6 | Soft delete only for expenses | **No DELETE policy exists** on `expenses` — impossible for any client |

Expenses are written through `create_expense` / `update_expense` RPCs rather
than table inserts, because PostgREST gives every request its own transaction
and invariant 1 must be checked with the expense and its splits both present.

### Usernames

Every user is assigned one at signup: **4–6 letters of their name, then 2–4
random digits** — `Akshay` → `aksh5318`, `akshay72`, `aksh145`.

Generated in the database (`gen_username` / `allocate_username`, migration
`20260817000900`), not the client, because uniqueness has to be decided where
the unique index lives — otherwise two simultaneous signups could both win.
`allocate_username` is `SECURITY DEFINER` so its collision check sees every row
rather than only the ones RLS would show the caller.

Edge cases are handled in the generator, verified over 2,700 samples with zero
format failures:

| Seed | Result |
| --- | --- |
| `Akshay` | `aksh5318` |
| `Jo` (too short) | `jonw181` — padded to a 4-letter minimum |
| `José Álvarez` | `joslv76` — non-ASCII stripped |
| `李雷`, `""` | `user8758` — falls back rather than producing an invalid name |

Usernames are **assigned, not chosen**. A `freeze_username` trigger rejects any
change, because `profileRepo.update()` takes a patch object and a stray key
would otherwise silently rewrite someone's identity. Renaming yourself is
`display_name`, which stays freely editable.

### Derived views: summary, filters, activity

`lib/trip-insights.ts` holds the trip summary, expense filtering and the recent
activity feed. Three properties matter:

- **Nothing there recalculates a balance.** Totals come from stored
  `base_amount_cents`; "outstanding" is the sum of the *positive* net balances
  (the negatives mirror them, so summing one side avoids double-counting).
  `lib/balances.ts` and `trip_member_balances` stay the only source of truth.
- **Filtering is presentation only.** It never mutates the input and the summary
  and balances always read the full, unfiltered list — a filter cannot change
  what anyone owes.
- **Activity has no table.** Every item is backed by a real expense, settlement
  or member row. That means edits and deletions don't appear; showing them would
  require writing history rows on every mutation, which is a lot of machinery
  for a glanceable panel.

### A note on category colours

The nine category tints were checked with a CVD/contrast validator, not chosen
by eye. Two pairs were genuinely indistinguishable and were fixed:
transport ↔ accommodation (ΔE 11.2 → 15.2, normal vision) and
shopping ↔ tickets (ΔE 3.7 → 9.8, deuteranopia).

Nine categorical hues **cannot** all separate under colour-blind simulation — no
palette of that size can. So colour is never load-bearing: every category is
labelled with its name or emoji, and the spending breakdown encodes magnitude
with bar length in a single hue rather than colouring each row.

### Row Level Security

RLS is on for **every** table with explicit policies. Core rule: you can touch a
trip's rows only if you hold a `trip_members` row with `removed_at is null`.
Only `role = 'owner'` can delete a trip or remove members.

Membership checks go through `SECURITY DEFINER` helpers (`is_trip_member`,
`is_trip_owner`, `can_access_expense`) so policies on `trip_members` don't
recurse into themselves. The invite flow uses two more (`trip_preview_by_code`,
`join_trip_by_code`) because someone accepting an invite is by definition not
yet a member.

---

## Bugs found and fixed

Each of these was reproduced before being changed.

### Trip creation was impossible — `INSERT ... RETURNING` vs RLS

`repo.trips.create()` did `.insert(...).select('*').single()`. PostgREST issues
that as `INSERT ... RETURNING`, and **Postgres applies SELECT policies to
`RETURNING` as an additional `WITH CHECK`**. `trips_select` requires
`is_trip_member(id)` — but that row is written by `trips_add_owner_member`, an
`AFTER INSERT` trigger, which fires at end of statement, *after* `RETURNING` is
evaluated. Every attempt failed with `42501`.

The tell: a plain `INSERT` succeeded; only `INSERT ... RETURNING` failed. Which
is why the policy looks correct read in isolation.

Fixed in `20260817000700` with a `create_trip` RPC that also seeds participants,
so trip + people are one transaction. The SELECT policy additionally now allows
`created_by = auth.uid()`, so the same class of bug cannot reappear silently.

### Deleting a trip violated a foreign key

`expense_splits.member_id` and `expenses.paid_by` reference `trip_members`,
which cascades from `trips` — so the cascade collided with itself. Fixed in
`20260817000800` by cascading those references. Found by the cleanup step of the
end-to-end check, not by hand.

### `service_role` had no table grants

Grants were explicit for `anon`/`authenticated` but relied on Supabase's
implicit default privileges for `service_role`. Hosted projects confer those; a
local stack does not, so the seed script failed. Now granted explicitly.

### `create_expense` used `auth.uid()` unconditionally

Any backend caller (the seed script) hit a NOT NULL violation. Now takes an
optional `p_created_by`, consulted **only** when there is no JWT context —
`auth.uid()` always wins for a real user, so it cannot forge authorship.

### Archive also opened the trip

`TripCard` had a pressable `Button` inside a pressable `Card`. On web the DOM
click bubbles, so archiving navigated into the trip too. The card is no longer
pressable; only its text region is.

### Form state initialised before its data arrived

`useState` initialisers run on first render, before queries resolve. Two
consequences: new expenses defaulted to USD instead of the trip currency, and
editing a JPY expense showed **"55.00" for ¥5,500** because `decimal_digits`
fell back to 2. Both fixed by a single effect that seeds once the data lands.

### `.env.local` pointed at the wrong backend

Commented-out hosted values were being read as live assignments — backticks in
the comments broke Expo's dotenv parsing. The app silently talked to an empty
project while appearing correctly configured. **Never leave commented-out
`EXPO_PUBLIC_*` keys in that file.** Caught by grepping the built bundle rather
than trusting the file.

---

## Decisions worth knowing

- **Claiming an identity on join.** The join screen lists unclaimed bare-name members and lets the arrival pick, or join as someone new. There is no reliable way to *guess* which name belongs to them.
- **Cross-rates only for currencies in use.** Storing every pair would be ~40,000 rows/day. `sync-fx-rates` writes USD-pivot rows plus cross-rates for currencies trips actually use; `lib/fx.ts` derives the rest arithmetically at read time.
- **Vitest pinned to 3.x**, and **local Logflare analytics disabled** in `supabase/config.toml` — both because of Node 21 / Windows. Node 22 LTS would remove the need for the first.
- **Web output is `single` (SPA), not `static`.** The whole app is behind auth, so prerendering gains nothing, and static rendering evaluates the Supabase client in Node at build time. That means `app/+html.tsx` is not honoured, so PWA tags are injected by `scripts/finalize-web.mjs`.
- **`receipt_url` survived the Scan Receipt removal.** That column is storage, not the scan feature; dropping a column from a ledger schema for tidiness is a bad trade. The `expo-image-picker` dependency *was* removed.
- **Trip updates are open to all members**, matching the brief's core RLS rule; only deletion and member removal are owner-only. Tighten `trips_update` if renaming and archiving should be owner-only too.
- **The client computes the FX pin; the database validates only internal consistency.** A modified client could submit a rate that never existed. Acceptable among friends; moving the pin into `create_expense` would close it.

---

## Design system

Dark and minimalist. The *structure* follows an "Elara FinTech" reference —
near-black base `#0A0B0F`, a four-step surface stack, hairline borders and **no
shadows**, since on dark UI a drop shadow reads as a smudge. The *accent* comes
from the Splex logo.

The logo's core blue `#2241FC` is unusable as-is: only **3.03:1** against the
background, which fails AA for text. So the accent is lifted out of that hue and
split into two tokens, because it does two jobs with opposite contrast needs:

| Token | Use | Contrast |
| --- | --- | --- |
| `primary` `#6C5CFF` | fills and strokes | white label on it: **4.55:1** |
| `primaryText` `#8B7BFF` | accent as foreground on dark | **5.97:1** on the background |

One value for both would fail one job or the other. The rule is: accent as
foreground → `primaryText`; accent as fill or stroke → `primary`.

`positive` keeps the mint `#00E5A0`. It used to be the same colour as the
accent, which made "you are owed" indistinguishable from "brand"; now green
means money and violet means brand.

Inter, with each weight as a separate font file (React Native has no synthetic
bolding — see `familyForWeight()`), and tabular numerals on the `display` and
`title` variants so money columns line up.

Branding is generated: `assets/logo.png` is the single source, and
`node scripts/make-icons.mjs` produces every favicon, PWA and native icon size.
Re-run it after replacing the logo. It downscales on **premultiplied alpha** —
averaging straight RGBA across a transparent edge leaves a dark halo — and makes
the iOS app icon and maskable PWA icon opaque, since alpha is rejected there and
launchers crop maskable icons to a circle.

---

## Verification

```bash
npm test        # 81 tests, no mocks, no database — all pure functions
npm run typecheck
```

The full flow has been verified end-to-end against the live local API using the
app's own money/split/FX modules: trip created and immediately readable,
participants attached, expense saved in THB on a non-today date, only the chosen
splitters charged, splits summing to the amount and base-splits to the base
amount, balances summing to zero, and the database view agreeing with
`lib/balances.ts`.

Test coverage matches the original brief: minor-unit parsing for 2/0/3-digit
currencies, equal-split rounding across 2–7 members including `$10/3` and
`$0.01/3`, exact and percent validation, FX pinning including a VND→KWD case
crossing 0→3 decimal digits, balance stability under FX movement, display
conversion without mutation, settlements and debt simplification, and the
re-pin rules on edit.

---

## Outstanding

- **The hosted project has no schema.** `supabase/apply-all.sql` (regenerate with `npm run bundle:sql`) is ready to paste. It includes a `public.users` backfill for accounts created before the trigger existed.
- **`apply-all.sql` has never been executed as a single script.** Its 10 migrations are proven via `npx supabase db reset`; the concatenated file is only checked structurally.
- **`sync-fx-rates` is not deployed.** Rates currently come from the seed script. Deploying it plus the Vault secrets switches to live rates.
- **Node 21.7.1 is EOL** and outside RN 0.86's supported range. Everything works, but Node 22 LTS would remove the Vitest pin and let static web rendering work.
- **No automated UI tests.** All 81 tests cover pure logic; the screens are verified by hand and by the end-to-end API check.
- Out of scope by original design: receipt scanning/OCR, recurring expenses, comments, notifications, native builds, historical-rate backfill, crypto.
