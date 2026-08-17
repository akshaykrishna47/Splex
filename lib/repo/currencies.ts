import { supabase } from '@/lib/supabase';
import type { Currency } from '@/lib/types';

export const currenciesRepo = {
  /**
   * The whole ISO 4217 table. It is small, static, and every money operation
   * depends on `decimal_digits`, so it is fetched once and cached for the
   * session rather than being queried per screen.
   */
  async list(): Promise<Currency[]> {
    const { data, error } = await supabase
      .from('currencies')
      .select('code, name, symbol, decimal_digits')
      .order('code');

    if (error) throw error;
    return (data ?? []) as Currency[];
  },
};
