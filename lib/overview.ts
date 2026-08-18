/**
 * The cross-trip "who owes whom" summary shown on Home.
 *
 * This does NOT compute balances. It runs the existing per-trip
 * `simplifyDebts` over the existing balance rows and keeps only the transfers
 * the current user is part of — so there is exactly one debt calculation in the
 * app, and this is a view of it.
 */

import { simplifyDebts } from './balances';
import type { TripScopedBalance } from './repo/balances';
import type { CurrencyCode, Trip, Uuid } from './types';

export type DebtRow = {
  /** Stable key: the counterparty's account, or their member row if unregistered. */
  key: string;
  name: string;
  /** The trip's base currency — the authoritative one for settling. */
  currency: CurrencyCode;
  /** Always positive; the direction is carried by which list it lands in. */
  amountCents: number;
  /** Which trips this figure came from, for the subtitle. */
  tripNames: string[];
};

export type DebtSummary = {
  owedToYou: DebtRow[];
  youOwe: DebtRow[];
};

/**
 * Amounts are NETTED per person per currency, and never across currencies.
 *
 * Netting: if you owe Sam 80 in one trip and Sam owes you 40 in another, that
 * is one debt of 40, not two rows facing opposite directions. The two of you
 * would settle it with a single payment, so that is the figure to show. A pair
 * that cancels out exactly disappears from the summary rather than showing as
 * a zero.
 *
 * Per currency: two trips settling in SGD collapse into one line for that
 * person; a third in THB gets its own line. Netting across currencies would
 * need a conversion, and a converted total is not what anyone actually
 * settles — the trip's base currency is. Better two honest rows than one
 * invented number.
 */
export function buildDebtSummary(input: {
  trips: Pick<Trip, 'id' | 'name' | 'base_currency'>[];
  balances: TripScopedBalance[];
  /** The caller's member row id in each trip they belong to. */
  myMemberIds: Set<Uuid>;
}): DebtSummary {
  const tripsById = new Map(input.trips.map((t) => [t.id, t]));

  const byTrip = new Map<Uuid, TripScopedBalance[]>();
  for (const balance of input.balances) {
    const bucket = byTrip.get(balance.trip_id);
    if (bucket) bucket.push(balance);
    else byTrip.set(balance.trip_id, [balance]);
  }

  /** Keyed by person-and-currency. Positive: they owe you. Negative: you owe them. */
  const totals = new Map<string, { row: Omit<DebtRow, 'amountCents'>; signedCents: number }>();

  for (const [tripId, rows] of byTrip) {
    const trip = tripsById.get(tripId);
    if (!trip) continue;

    const mine = rows.find((r) => input.myMemberIds.has(r.member_id));
    if (!mine) continue;

    let transfers;
    try {
      transfers = simplifyDebts(rows);
    } catch {
      // simplifyDebts refuses when a trip's nets don't sum to zero. Skip that
      // trip rather than letting one inconsistent ledger blank the whole
      // summary.
      continue;
    }

    for (const transfer of transfers) {
      const involvesMe =
        transfer.from_member === mine.member_id || transfer.to_member === mine.member_id;
      if (!involvesMe) continue;

      const theyOweMe = transfer.to_member === mine.member_id;
      const counterpartyId = theyOweMe ? transfer.from_member : transfer.to_member;
      const counterparty = rows.find((r) => r.member_id === counterpartyId);
      if (!counterparty) continue;

      // Merge the same person across trips by account. Someone added as a bare
      // name has no account, so they stay scoped to their trip — two unrelated
      // "Sam"s must not be silently combined.
      const identity = counterparty.user_id ?? `${tripId}:${counterparty.member_id}`;
      const key = `${identity}|${trip.base_currency}`;

      // The sign is the direction, so opposite-facing debts across trips cancel
      // instead of becoming two rows.
      const signedCents = theyOweMe ? transfer.amount_cents : -transfer.amount_cents;
      const existing = totals.get(key);

      if (existing) {
        existing.signedCents += signedCents;
        if (!existing.row.tripNames.includes(trip.name)) existing.row.tripNames.push(trip.name);
      } else {
        totals.set(key, {
          signedCents,
          row: {
            key,
            name: counterparty.display_name,
            currency: trip.base_currency,
            tripNames: [trip.name],
          },
        });
      }
    }
  }

  const owedToYou: DebtRow[] = [];
  const youOwe: DebtRow[] = [];

  for (const { row, signedCents } of totals.values()) {
    // Exactly square with this person in this currency: nothing to settle, so
    // showing them at all would be noise.
    if (signedCents === 0) continue;

    const target = signedCents > 0 ? owedToYou : youOwe;
    target.push({ ...row, amountCents: Math.abs(signedCents) });
  }

  const byAmount = (a: DebtRow, b: DebtRow) => b.amountCents - a.amountCents;

  return { owedToYou: owedToYou.sort(byAmount), youOwe: youOwe.sort(byAmount) };
}
