import { supabase } from '@/lib/supabase';
import type { TripMember, Uuid } from '@/lib/types';

/** The minimum a username lookup may reveal about someone. */
export type PublicUser = {
  id: Uuid;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

export type TripPreview = {
  trip_id: Uuid;
  name: string;
  base_currency: string;
  member_count: number;
  already_member: boolean;
  unclaimed_members: { id: Uuid; display_name: string }[];
};

export const membersRepo = {
  /**
   * Members of a trip, ordered by id — the same order the remainder
   * distribution in money.ts assumes.
   */
  async listForTrip(tripId: Uuid, includeRemoved = false): Promise<TripMember[]> {
    let query = supabase.from('trip_members').select('*').eq('trip_id', tripId).order('id');
    if (!includeRemoved) query = query.is('removed_at', null);

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as TripMember[];
  },

  /**
   * Every member row belonging to this user, across all their trips.
   *
   * RLS already limits the table to trips they belong to, so this is one
   * request rather than one per trip.
   */
  async mine(userId: Uuid): Promise<TripMember[]> {
    const { data, error } = await supabase
      .from('trip_members')
      .select('*')
      .eq('user_id', userId)
      .is('removed_at', null);

    if (error) throw error;
    return (data ?? []) as TripMember[];
  },

  /** Which member row the signed-in user occupies in this trip, if any. */
  async myMembership(tripId: Uuid, userId: Uuid): Promise<TripMember | null> {
    const { data, error } = await supabase
      .from('trip_members')
      .select('*')
      .eq('trip_id', tripId)
      .eq('user_id', userId)
      .is('removed_at', null)
      .maybeSingle();

    if (error) throw error;
    return (data as TripMember) ?? null;
  },

  /**
   * Look up a Splex account by its exact username.
   *
   * Exact match only, by design — a partial search would let anyone enumerate
   * the user base. Returns display name and avatar, never the email.
   */
  async findByUsername(username: string): Promise<PublicUser | null> {
    const { data, error } = await supabase
      .rpc('find_user_by_username', { p_username: username.trim() })
      .maybeSingle();

    if (error) throw error;
    return (data as PublicUser) ?? null;
  },

  /**
   * Add an existing Splex account to the trip by username.
   *
   * Throws with a readable message when the username does not exist or the
   * person is already on the trip. Someone who left before is reinstated
   * rather than duplicated.
   */
  async addByUsername(tripId: Uuid, username: string): Promise<TripMember> {
    const { data, error } = await supabase.rpc('add_member_by_username', {
      p_trip_id: tripId,
      p_username: username.trim(),
    });

    if (error) throw error;
    return data as TripMember;
  },

  /** Add a bare name with no account attached. user_id stays null. */
  async addByName(tripId: Uuid, displayName: string): Promise<TripMember> {
    const { data, error } = await supabase
      .from('trip_members')
      .insert({ trip_id: tripId, display_name: displayName.trim(), role: 'member' })
      .select('*')
      .single();

    if (error) throw error;
    return data as TripMember;
  },

  async rename(memberId: Uuid, displayName: string): Promise<void> {
    const { error } = await supabase
      .from('trip_members')
      .update({ display_name: displayName.trim() })
      .eq('id', memberId);
    if (error) throw error;
  },

  /**
   * Leave a trip yourself.
   *
   * Goes through an RPC because leaving can require promoting the next member
   * to owner, which an ordinary member cannot do. The RPC also refuses if your
   * balance is non-zero or you are the last person on the trip.
   */
  async leave(tripId: Uuid): Promise<void> {
    const { error } = await supabase.rpc('leave_trip', { p_trip_id: tripId });
    if (error) throw error;
  },

  /**
   * Soft removal. Owner only (RLS enforces it). The row stays so historical
   * expenses and balances that reference this member remain intact.
   */
  async remove(memberId: Uuid): Promise<void> {
    const { error } = await supabase
      .from('trip_members')
      .update({ removed_at: new Date().toISOString() })
      .eq('id', memberId);
    if (error) throw error;
  },

  // -------------------------------------------------------------------------
  // Invite flow. Both of these are SECURITY DEFINER RPCs because the caller is
  // not a member yet and so cannot read the trip through RLS.
  // -------------------------------------------------------------------------

  async previewByCode(code: string): Promise<TripPreview | null> {
    const { data, error } = await supabase
      .rpc('trip_preview_by_code', { p_code: code.trim() })
      .maybeSingle();

    if (error) throw error;
    return (data as TripPreview) ?? null;
  },

  /**
   * Joining links the account onto an existing bare-name member row when the
   * user claims one, rather than creating a duplicate person in the trip.
   */
  async joinByCode(params: {
    code: string;
    claimMemberId?: Uuid | null;
    displayName?: string | null;
  }): Promise<Uuid> {
    const { data, error } = await supabase.rpc('join_trip_by_code', {
      p_code: params.code.trim(),
      p_claim_member_id: params.claimMemberId ?? null,
      p_display_name: params.displayName ?? null,
    });

    if (error) throw error;
    return data as Uuid;
  },
};
