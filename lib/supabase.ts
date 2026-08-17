import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

/**
 * The ONLY module in the app that imports `@supabase/supabase-js`.
 *
 * Everything else goes through `lib/repo/`. That rule is what keeps the
 * storage layer swappable and the business logic testable without a network.
 */

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Copy .env.example to .env.local and fill them in, then restart the dev server.',
  );
}

export const supabase = createClient(url, anonKey, {
  auth: {
    // On web the default localStorage adapter is correct and, importantly, is
    // what lets the magic-link redirect land back in an authenticated session.
    ...(Platform.OS === 'web' ? {} : { storage: AsyncStorage }),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});
