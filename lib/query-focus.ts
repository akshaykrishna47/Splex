import { AppState, Platform } from 'react-native';
import { focusManager } from '@tanstack/react-query';

/**
 * Teaches React Query what "focused" means on iOS and Android.
 *
 * `refetchOnWindowFocus` is driven by the browser's `visibilitychange` event,
 * which does not exist in React Native — so on a phone `focusManager` reports
 * "focused" forever. Two consequences: returning to the app from the home
 * screen never refetches, and `refetchInterval` keeps firing while the app is
 * backgrounded, spending battery and mobile data on a screen nobody is looking
 * at. Bridging `AppState` fixes both.
 *
 * No-op on the web, where the built-in listener is already correct.
 */
export function installQueryFocus(): () => void {
  if (Platform.OS === 'web') return () => {};

  const subscription = AppState.addEventListener('change', (status) => {
    focusManager.setFocused(status === 'active');
  });

  return () => subscription.remove();
}
