import { supabase } from '@/lib/supabase';
import type { CurrencyCode, Trip, Uuid } from '@/lib/types';

export type TripSummary = Trip & {
  member_count: number;
};

export const tripsRepo = {
  /** Every trip the signed-in user is still a member of. RLS does the filtering. */
  async list(): Promise<TripSummary[]> {
    const { data, error } = await supabase
      .from('trips')
      .select('*, trip_members(id, removed_at)')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data ?? []).map((row) => {
      const { trip_members: members, ...trip } = row as Trip & {
        trip_members: { id: string; removed_at: string | null }[];
      };
      return {
        ...trip,
        member_count: (members ?? []).filter((m) => !m.removed_at).length,
      };
    });
  },

  async get(id: Uuid): Promise<Trip | null> {
    const { data, error } = await supabase.from('trips').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return (data as Trip) ?? null;
  },

  /**
   * Goes through an RPC rather than a table insert, and must stay that way.
   *
   * A plain `.insert(...).select()` is INSERT ... RETURNING, and Postgres
   * applies SELECT policies to RETURNING. `trips_select` needs a trip_members
   * row that only exists once the AFTER INSERT trigger has run — which is after
   * RETURNING is evaluated. The insert therefore always failed with 42501.
   *
   * The RPC also seeds the initial participants, so creating a trip and adding
   * people to it is one transaction instead of several that can half-fail.
   */
  async create(params: {
    name: string;
    baseCurrency: CurrencyCode;
    memberNames?: string[];
    description?: string | null;
    emoji?: string | null;
  }): Promise<Trip> {
    const { data, error } = await supabase.rpc('create_trip', {
      p_name: params.name.trim(),
      p_base_currency: params.baseCurrency.toUpperCase(),
      p_member_names: (params.memberNames ?? [])
        .map((n) => n.trim())
        .filter((n) => n.length > 0),
      p_description: params.description?.trim() || null,
      p_emoji: params.emoji || null,
    });

    if (error) throw error;
    if (!data) throw new Error('Trip was not created. Please try again.');
    return data as Trip;
  },

  async rename(id: Uuid, name: string): Promise<void> {
    const { error } = await supabase.from('trips').update({ name: name.trim() }).eq('id', id);
    if (error) throw error;
  },

  /** Edit the trip's presentation. Base currency is deliberately not editable. */
  async update(
    id: Uuid,
    patch: { name?: string; description?: string | null; emoji?: string | null },
  ): Promise<void> {
    const { error } = await supabase
      .from('trips')
      .update({
        ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
        ...(patch.description !== undefined
          ? { description: patch.description?.trim() || null }
          : {}),
        ...(patch.emoji !== undefined ? { emoji: patch.emoji || null } : {}),
      })
      .eq('id', id);

    if (error) throw error;
  },

  async setArchived(id: Uuid, archived: boolean): Promise<void> {
    const { error } = await supabase
      .from('trips')
      .update({ archived_at: archived ? new Date().toISOString() : null })
      .eq('id', id);
    if (error) throw error;
  },

  /**
   * Owner only — enforced by RLS, not by this function.
   *
   * The `.select()` matters: when RLS blocks the delete it matches zero rows
   * and PostgREST still returns success, so without checking what came back a
   * non-owner would be told the trip was deleted while it sat there untouched.
   */
  async remove(id: Uuid): Promise<void> {
    const { data, error } = await supabase.from('trips').delete().eq('id', id).select('id');
    if (error) throw error;

    if (!data || data.length === 0) {
      throw new Error('Only the trip owner can delete this trip.');
    }
  },
};
