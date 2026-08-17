import { supabase } from '@/lib/supabase';
import type { Settlement, Uuid } from '@/lib/types';

export const settlementsRepo = {
  async listForTrip(tripId: Uuid): Promise<Settlement[]> {
    const { data, error } = await supabase
      .from('settlements')
      .select('*')
      .eq('trip_id', tripId)
      .order('settled_at', { ascending: false });

    if (error) throw error;
    return (data ?? []) as Settlement[];
  },

  /**
   * `amountCents` is ALWAYS in the trip's base currency. A payment recorded
   * while viewing a different display currency must be converted before it
   * reaches this function, and the user must have been shown the base-currency
   * figure they are actually clearing.
   */
  async record(params: {
    tripId: Uuid;
    fromMember: Uuid;
    toMember: Uuid;
    amountCents: number;
    createdBy: Uuid;
    note?: string | null;
  }): Promise<Settlement> {
    const { data, error } = await supabase
      .from('settlements')
      .insert({
        trip_id: params.tripId,
        from_member: params.fromMember,
        to_member: params.toMember,
        amount_cents: params.amountCents,
        note: params.note?.trim() || null,
        created_by: params.createdBy,
      })
      .select('*')
      .single();

    if (error) throw error;
    return data as Settlement;
  },

  async remove(settlementId: Uuid): Promise<void> {
    const { error } = await supabase.from('settlements').delete().eq('id', settlementId);
    if (error) throw error;
  },
};
