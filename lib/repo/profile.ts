import { supabase } from '@/lib/supabase';
import type { CurrencyCode, UserProfile, Uuid } from '@/lib/types';

export const profileRepo = {
  async get(userId: Uuid): Promise<UserProfile | null> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) throw error;
    return (data as UserProfile) ?? null;
  },

  /**
   * `username` is deliberately absent from this patch type — it is assigned, not
   * chosen, and the database rejects any attempt to change it.
   */
  async update(
    userId: Uuid,
    patch: { display_name?: string; avatar_url?: string | null; display_currency?: CurrencyCode | null },
  ): Promise<void> {
    const { error } = await supabase.from('users').update(patch).eq('id', userId);
    if (error) throw error;
  },
};
