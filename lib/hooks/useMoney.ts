import { useMemo } from 'react';
import { buildRateTable, convertForDisplay, resolveRate, type ResolvedRate } from '@/lib/fx';
import { formatMinor, indexCurrencies, type FormatOptions } from '@/lib/money';
import { useCurrencies, useProfile, useRates } from '@/lib/queries';
import { usePrefsStore } from '@/lib/stores/prefs';
import { useSessionStore } from '@/lib/stores/session';
import type { CurrencyCode, Trip } from '@/lib/types';

/**
 * Everything a screen needs to render money correctly.
 *
 * The distinction this hook exists to keep straight:
 *
 *   formatBase(minor)     the authoritative figure, in the trip's base
 *                         currency, exactly as stored.
 *   formatDisplay(minor)  the same figure converted live into the user's
 *                         chosen display currency, for reading only. Nothing
 *                         produced here may ever be written back.
 */
export function useMoney(trip?: Trip | null) {
  const session = useSessionStore((s) => s.session);
  const { data: currencyRows = [], isLoading: currenciesLoading } = useCurrencies();
  const { data: rateRows = [], isLoading: ratesLoading } = useRates();
  const { data: profile } = useProfile(session?.user.id);

  const tripOverride = usePrefsStore((s) =>
    trip ? s.displayCurrencyByTrip[trip.id] : undefined,
  );

  const currencies = useMemo(() => indexCurrencies(currencyRows), [currencyRows]);
  const rateTable = useMemo(() => buildRateTable(rateRows), [rateRows]);

  const baseCurrency = (trip?.base_currency ?? 'USD').toUpperCase();

  // Per-trip override beats the profile default, which beats the trip's own
  // base currency (i.e. no conversion at all).
  const displayCurrency = (
    tripOverride ??
    profile?.display_currency ??
    baseCurrency
  ).toUpperCase();

  const isConverting = displayCurrency !== baseCurrency;

  const displayRate: ResolvedRate | null = useMemo(() => {
    if (!isConverting) return null;
    return resolveRate(baseCurrency, displayCurrency, rateTable);
  }, [isConverting, baseCurrency, displayCurrency, rateTable]);

  return useMemo(() => {
    function formatBase(minor: number, options?: FormatOptions): string {
      return formatMinor(minor, baseCurrency, currencies, options);
    }

    /**
     * Render a base-currency figure in the display currency. Falls back to the
     * base currency when no rate is available, rather than inventing one.
     */
    function formatDisplay(minor: number, options?: FormatOptions): string {
      if (!isConverting) return formatBase(minor, options);

      const converted = convertForDisplay(
        minor,
        baseCurrency,
        displayCurrency,
        currencies,
        rateTable,
      );
      if (!converted) return formatBase(minor, options);

      return formatMinor(converted.minor, displayCurrency, currencies, options);
    }

    /** Format an amount already known to be in `code`. */
    function formatIn(minor: number, code: CurrencyCode, options?: FormatOptions): string {
      return formatMinor(minor, code, currencies, options);
    }

    return {
      currencies,
      currencyList: currencyRows,
      rateTable,
      baseCurrency,
      displayCurrency,
      isConverting,
      displayRate,
      /** True when a conversion is wanted but no cached rate can supply it. */
      missingDisplayRate: isConverting && displayRate === null,
      ready: !currenciesLoading && !ratesLoading && currencyRows.length > 0,
      formatBase,
      formatDisplay,
      formatIn,
    };
  }, [
    currencies,
    currencyRows,
    rateTable,
    baseCurrency,
    displayCurrency,
    isConverting,
    displayRate,
    currenciesLoading,
    ratesLoading,
  ]);
}
