import { indexCurrencies } from '@/lib/money';
import type { Currency, FxRate } from '@/lib/types';

/**
 * A slice of the currencies table covering every decimal_digits case the app
 * has to handle: 2 (the common case), 0 (JPY, VND, KRW), 3 (KWD, BHD).
 */
export const CURRENCY_ROWS: Currency[] = [
  { code: 'USD', name: 'US Dollar', symbol: '$', decimal_digits: 2 },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', decimal_digits: 2 },
  { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM', decimal_digits: 2 },
  { code: 'THB', name: 'Thai Baht', symbol: '฿', decimal_digits: 2 },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', decimal_digits: 0 },
  { code: 'VND', name: 'Vietnamese Dong', symbol: '₫', decimal_digits: 0 },
  { code: 'KRW', name: 'South Korean Won', symbol: '₩', decimal_digits: 0 },
  { code: 'KWD', name: 'Kuwaiti Dinar', symbol: 'KD', decimal_digits: 3 },
  { code: 'BHD', name: 'Bahraini Dinar', symbol: '.د.ب', decimal_digits: 3 },
];

export const CURRENCIES = indexCurrencies(CURRENCY_ROWS);

let fxId = 0;

export function fxRow(
  base: string,
  quote: string,
  rate: string,
  overrides: Partial<FxRate> = {},
): FxRate {
  fxId += 1;
  return {
    id: `fx-${fxId}`,
    base_currency: base,
    quote_currency: quote,
    rate,
    rate_date: '2026-08-17',
    source: 'fawazahmed0/currency-api',
    fetched_at: '2026-08-17T06:00:00.000Z',
    created_at: '2026-08-17T06:00:00.000Z',
    ...overrides,
  };
}

/** Member ids are deliberately ordered so remainder distribution is testable. */
export const MEMBERS = {
  aditi: '11111111-1111-1111-1111-111111111111',
  ben: '22222222-2222-2222-2222-222222222222',
  cara: '33333333-3333-3333-3333-333333333333',
  dan: '44444444-4444-4444-4444-444444444444',
  eve: '55555555-5555-5555-5555-555555555555',
  finn: '66666666-6666-6666-6666-666666666666',
  gita: '77777777-7777-7777-7777-777777777777',
} as const;

export const MEMBER_LIST = [
  { id: MEMBERS.aditi, display_name: 'Aditi' },
  { id: MEMBERS.ben, display_name: 'Ben' },
  { id: MEMBERS.cara, display_name: 'Cara' },
  { id: MEMBERS.dan, display_name: 'Dan' },
  { id: MEMBERS.eve, display_name: 'Eve' },
  { id: MEMBERS.finn, display_name: 'Finn' },
  { id: MEMBERS.gita, display_name: 'Gita' },
];
