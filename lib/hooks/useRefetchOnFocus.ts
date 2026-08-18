import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Refetches the screen's live data every time the screen gains focus.
 *
 * Without this, navigating back to a screen updates nothing. React Query only
 * refetches on three triggers — a new observer mounting, the window regaining
 * focus, or an interval tick — and tapping "Home" fires none of them: the stack
 * keeps lower screens mounted, so no observer remounts, and an in-app tap never
 * blurs the browser window. The screen just re-renders whatever was in the
 * cache when it was last on top, which is what "nothing updates until I hit
 * refresh" was.
 *
 * Targets the queries tagged `meta.live` in `lib/queries.ts` — the shared,
 * money-moving state. Currencies and FX rates are deliberately excluded; they
 * would otherwise refetch on every navigation for data that changes twice a day.
 */
export function useRefetchOnFocus(): void {
  const client = useQueryClient();

  useFocusEffect(
    useCallback(() => {
      void client.invalidateQueries({
        predicate: (query) => query.meta?.live === true,
        // Only what is mounted right now gets a request. Other trips' cached
        // data is still marked stale, so it refetches when next opened.
        refetchType: 'active',
      });
    }, [client]),
  );
}
