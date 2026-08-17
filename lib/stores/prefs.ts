import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { CurrencyCode, Uuid } from '@/lib/types';

/**
 * Local, per-device preferences. None of this is ledger data — losing it costs
 * the user a couple of taps, nothing more.
 */
type PrefsState = {
  /**
   * Display currency chosen per trip, overriding the profile default. Purely
   * cosmetic: it changes what figures are rendered in, never what is stored.
   */
  displayCurrencyByTrip: Record<Uuid, CurrencyCode>;

  /**
   * Last currency an expense was entered in, per trip. Someone in Thailand
   * enters THB fifteen times in a row and should not reselect it each time.
   */
  lastCurrencyByTrip: Record<Uuid, CurrencyCode>;

  /** Most-recently-used currencies, newest first, for ordering the picker. */
  recentCurrencies: CurrencyCode[];

  setTripDisplayCurrency: (tripId: Uuid, code: CurrencyCode | null) => void;
  rememberTripCurrency: (tripId: Uuid, code: CurrencyCode) => void;
};

const MAX_RECENT = 8;

export const usePrefsStore = create<PrefsState>()(
  persist(
    (set) => ({
      displayCurrencyByTrip: {},
      lastCurrencyByTrip: {},
      recentCurrencies: [],

      setTripDisplayCurrency: (tripId, code) =>
        set((state) => {
          const next = { ...state.displayCurrencyByTrip };
          if (code) next[tripId] = code.toUpperCase();
          else delete next[tripId];
          return { displayCurrencyByTrip: next };
        }),

      rememberTripCurrency: (tripId, code) =>
        set((state) => {
          const upper = code.toUpperCase();
          return {
            lastCurrencyByTrip: { ...state.lastCurrencyByTrip, [tripId]: upper },
            recentCurrencies: [
              upper,
              ...state.recentCurrencies.filter((c) => c !== upper),
            ].slice(0, MAX_RECENT),
          };
        }),
    }),
    {
      name: 'splex-prefs',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
    },
  ),
);
