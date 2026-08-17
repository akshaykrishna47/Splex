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
 * Amounts are aggregated per person PER CURRENCY, never across currencies.
 *
 * Two trips settling in SGD collapse into one line for that person; a third in
 * THB gets its own line. Summing across currencies would need a conversion, and
 * a converted total is not what anyone actually settles — the trip's base
 * currency is. Better two honest rows than one invented number.
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

  const owed = new Map<string, DebtRow>();
  const owe = new Map<string, DebtRow>();

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

      const target = theyOweMe ? owed : owe;
      const existing = target.get(key);

      if (existing) {
        existing.amountCents += transfer.amount_cents;
        if (!existing.tripNames.includes(trip.name)) existing.tripNames.push(trip.name);
      } else {
        target.set(key, {
          key,
          name: counterparty.display_name,
          currency: trip.base_currency,
          amountCents: transfer.amount_cents,
          tripNames: [trip.name],
        });
      }
    }
  }

  const byAmount = (a: DebtRow, b: DebtRow) => b.amountCents - a.amountCents;

  return {
    owedToYou: [...owed.values()].sort(byAmount),
    youOwe: [...owe.values()].sort(byAmount),
  };
}
