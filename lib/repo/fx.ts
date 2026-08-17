import { supabase } from '@/lib/supabase';
import type { FxRate } from '@/lib/types';

/**
 * The client only ever READS fx_rates. Writes come exclusively from the
 * sync-fx-rates edge function using the service role key.
 */
export const fxRepo = {
  /** Newest cached rate per pair. */
  async latest(): Promise<FxRate[]> {
    const { data, error } = await supabase
      .from('fx_rates_latest')
      .select('base_currency, quote_currency, rate, rate_date, source, fetched_at');

    if (error) throw error;

    return (data ?? []).map((row, i) => ({
      id: `${row.base_currency}-${row.quote_currency}-${i}`,
      base_currency: row.base_currency as string,
      quote_currency: row.quote_currency as string,
      rate: String(row.rate),
      rate_date: row.rate_date as string,
      source: row.source as string,
      fetched_at: row.fetched_at as string,
      created_at: row.fetched_at as string,
    }));
  },

  /**
   * Ask the edge function to refresh. It no-ops when the cache is still fresh,
   * so calling this on app start is cheap.
   *
   * Failures are swallowed on purpose: a provider outage must not stop anyone
   * from using the app, it just means the cached rates stay where they are.
   */
  async requestSync(): Promise<{ ok: boolean }> {
    try {
      const { error } = await supabase.functions.invoke('sync-fx-rates', { body: {} });
      return { ok: !error };
    } catch {
      return { ok: false };
    }
  },
};
