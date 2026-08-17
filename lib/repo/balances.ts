import { supabase } from '@/lib/supabase';
import type { MemberBalance, Uuid } from '@/lib/types';

/**
 * Balances are read from the `trip_member_balances` view — derived every time,
 * never stored, always in the trip's base currency. INVARIANT 2.
 */
/** A balance row that still knows which trip it came from. */
export type TripScopedBalance = MemberBalance & {
  trip_id: Uuid;
  user_id: Uuid | null;
};

export const balancesRepo = {
  /**
   * Every balance across every trip the user belongs to, in one request.
   *
   * No trip filter is needed: `trip_member_balances` is a security_invoker
   * view, so RLS already limits it to trips the caller is a member of. That
   * keeps the Home summary to a single query instead of one per trip.
   */
  async forAllTrips(): Promise<TripScopedBalance[]> {
    const { data, error } = await supabase
      .from('trip_member_balances')
      .select(
        'trip_id, member_id, user_id, display_name, removed_at, paid_cents, owed_cents, settlements_cents, net_cents',
      );

    if (error) throw error;

    return (data ?? [])
      .map((row) => ({
        trip_id: row.trip_id as Uuid,
        member_id: row.member_id as Uuid,
        user_id: (row.user_id as Uuid | null) ?? null,
        display_name: row.display_name as string,
        removed_at: (row.removed_at as string | null) ?? null,
        paid_cents: Number(row.paid_cents),
        owed_cents: Number(row.owed_cents),
        settlements_cents: Number(row.settlements_cents),
        net_cents: Number(row.net_cents),
      }))
      // Same rule as forTrip: a removed member stays visible until square, or
      // the trip's nets would no longer sum to zero.
      .filter((row) => !row.removed_at || row.net_cents !== 0);
  },

  async forTrip(tripId: Uuid): Promise<MemberBalance[]> {
    const { data, error } = await supabase
      .from('trip_member_balances')
      .select(
        'member_id, display_name, removed_at, paid_cents, owed_cents, settlements_cents, net_cents',
      )
      .eq('trip_id', tripId)
      .order('member_id');

    if (error) throw error;

    // PostgREST returns bigint as a JS number here; the values are minor units
    // well inside the safe-integer range.
    return (data ?? [])
      .map((row) => ({
        member_id: row.member_id as Uuid,
        display_name: row.display_name as string,
        removed_at: (row.removed_at as string | null) ?? null,
        paid_cents: Number(row.paid_cents),
        owed_cents: Number(row.owed_cents),
        settlements_cents: Number(row.settlements_cents),
        net_cents: Number(row.net_cents),
      }))
      // Removed members are hidden ONLY once they are square. Dropping someone
      // who still owes (or is owed) would leave the remaining nets summing to
      // something other than zero, and simplifyDebts() rightly refuses to work
      // from an inconsistent ledger.
      .filter((row) => !row.removed_at || row.net_cents !== 0);
  },
};
