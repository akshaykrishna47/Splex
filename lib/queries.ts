/**
 * TanStack Query bindings over the repo layer.
 *
 * Components use these hooks; they never touch `repo` for reads directly, and
 * never touch Supabase at all.
 */

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { repo } from '@/lib/repo';
import type { ExpenseWriteInput } from '@/lib/repo';
import type { CurrencyCode, Uuid } from '@/lib/types';

/**
 * Shared options for every query that reflects state other people can change.
 *
 * `meta.live` is the tag `useRefetchOnFocus` looks for, so returning to a
 * screen re-reads this data and nothing else.
 *
 * `refetchInterval` keeps an open screen current without a manual refresh. A
 * minute, not a second: Home runs three of these and a trip screen five, so the
 * request rate is queries-per-interval per open tab — at 1s that is five
 * requests a second, forever, for data that changes a handful of times an hour.
 * React Query holds the interval while the window is unfocused
 * (`refetchIntervalInBackground` defaults to false), so it only costs anything
 * while somebody is actually looking at the screen.
 *
 * Currencies and FX rates are deliberately not tagged: `refetchInterval`
 * ignores `staleTime`, so they would be re-fetched every tick despite being
 * good for hours.
 */
const live = { meta: { live: true }, refetchInterval: 60_000 } as const;

export const keys = {
  currencies: ['currencies'] as const,
  rates: ['fx-rates'] as const,
  profile: (userId: Uuid) => ['profile', userId] as const,
  trips: ['trips'] as const,
  trip: (id: Uuid) => ['trip', id] as const,
  members: (tripId: Uuid) => ['members', tripId] as const,
  membership: (tripId: Uuid, userId: Uuid) => ['membership', tripId, userId] as const,
  expenses: (tripId: Uuid) => ['expenses', tripId] as const,
  expense: (id: Uuid) => ['expense', id] as const,
  balances: (tripId: Uuid) => ['balances', tripId] as const,
  settlements: (tripId: Uuid) => ['settlements', tripId] as const,
  invite: (code: string) => ['invite', code] as const,
};

// ---------------------------------------------------------------------------
// Reference data — long-lived, rarely changing
// ---------------------------------------------------------------------------

export function useCurrencies() {
  return useQuery({
    queryKey: keys.currencies,
    queryFn: () => repo.currencies.list(),
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  });
}

export function useRates() {
  return useQuery({
    queryKey: keys.rates,
    queryFn: () => repo.fx.latest(),
    // Rates change at most every 6 hours; there is no value in refetching more.
    staleTime: 30 * 60 * 1000,
  });
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export function useProfile(userId: Uuid | undefined) {
  return useQuery({
    queryKey: keys.profile(userId ?? 'anon'),
    queryFn: () => repo.profile.get(userId as Uuid),
    enabled: Boolean(userId),
  });
}

export function useUpdateProfile(userId: Uuid | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: {
      display_name?: string;
      display_currency?: CurrencyCode | null;
      avatar_url?: string | null;
    }) => repo.profile.update(userId as Uuid, patch),
    onSuccess: () => {
      if (userId) void client.invalidateQueries({ queryKey: keys.profile(userId) });
    },
  });
}

// ---------------------------------------------------------------------------
// Trips
// ---------------------------------------------------------------------------

export function useTrips() {
  return useQuery({ ...live, queryKey: keys.trips, queryFn: () => repo.trips.list() });
}

export function useTrip(tripId: Uuid | undefined) {
  return useQuery({
    ...live,
    queryKey: keys.trip(tripId ?? 'none'),
    queryFn: () => repo.trips.get(tripId as Uuid),
    enabled: Boolean(tripId),
  });
}

export function useCreateTrip() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      name: string;
      baseCurrency: CurrencyCode;
      memberNames?: string[];
      description?: string | null;
      emoji?: string | null;
    }) => repo.trips.create(params),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.trips });
      invalidateOverview(client);
    },
  });
}

export function useUpdateTrip(tripId: Uuid) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: { name?: string; description?: string | null; emoji?: string | null }) =>
      repo.trips.update(tripId, patch),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.trip(tripId) });
      void client.invalidateQueries({ queryKey: keys.trips });
    },
  });
}

export function useSetTripArchived() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (params: { tripId: Uuid; archived: boolean }) =>
      repo.trips.setArchived(params.tripId, params.archived),
    onSuccess: (_data, variables) => {
      void client.invalidateQueries({ queryKey: keys.trips });
      void client.invalidateQueries({ queryKey: keys.trip(variables.tripId) });
    },
  });
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

export function useMembers(tripId: Uuid | undefined, includeRemoved = false) {
  return useQuery({
    ...live,
    queryKey: [...keys.members(tripId ?? 'none'), includeRemoved],
    queryFn: () => repo.members.listForTrip(tripId as Uuid, includeRemoved),
    enabled: Boolean(tripId),
  });
}

export function useMyMembership(tripId: Uuid | undefined, userId: Uuid | undefined) {
  return useQuery({
    queryKey: keys.membership(tripId ?? 'none', userId ?? 'anon'),
    queryFn: () => repo.members.myMembership(tripId as Uuid, userId as Uuid),
    enabled: Boolean(tripId && userId),
  });
}

export function useAddMember(tripId: Uuid) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (displayName: string) => repo.members.addByName(tripId, displayName),
    onSuccess: () => invalidateTrip(client, tripId),
  });
}

export function useAddMemberByUsername(tripId: Uuid) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (username: string) => repo.members.addByUsername(tripId, username),
    onSuccess: () => invalidateTrip(client, tripId),
  });
}

export function useRemoveMember(tripId: Uuid) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (memberId: Uuid) => repo.members.remove(memberId),
    onSuccess: () => invalidateTrip(client, tripId),
  });
}

export function useLeaveTrip(tripId: Uuid) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => repo.members.leave(tripId),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.trips });
      void client.invalidateQueries({ queryKey: keys.trip(tripId) });
      invalidateOverview(client);
    },
  });
}

export function useDeleteTrip() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (tripId: Uuid) => repo.trips.remove(tripId),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.trips });
      invalidateOverview(client);
    },
  });
}

export function useRenameMember(tripId: Uuid) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (params: { memberId: Uuid; displayName: string }) =>
      repo.members.rename(params.memberId, params.displayName),
    onSuccess: () => invalidateTrip(client, tripId),
  });
}

// ---------------------------------------------------------------------------
// Invite
// ---------------------------------------------------------------------------

export function useInvitePreview(code: string | undefined) {
  return useQuery({
    queryKey: keys.invite(code ?? ''),
    queryFn: () => repo.members.previewByCode(code as string),
    enabled: Boolean(code),
    retry: false,
  });
}

export function useJoinTrip() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (params: { code: string; claimMemberId?: Uuid | null; displayName?: string | null }) =>
      repo.members.joinByCode(params),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.trips });
      invalidateOverview(client);
    },
  });
}

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

export function useExpenses(tripId: Uuid | undefined) {
  return useQuery({
    ...live,
    queryKey: keys.expenses(tripId ?? 'none'),
    queryFn: () => repo.expenses.listForTrip(tripId as Uuid),
    enabled: Boolean(tripId),
  });
}

export function useExpense(expenseId: Uuid | undefined) {
  return useQuery({
    queryKey: keys.expense(expenseId ?? 'none'),
    queryFn: () => repo.expenses.get(expenseId as Uuid),
    enabled: Boolean(expenseId),
  });
}

export function useSaveExpense(tripId: Uuid) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (params: { expenseId?: Uuid; input: ExpenseWriteInput }) =>
      params.expenseId
        ? repo.expenses.update(params.expenseId, params.input)
        : repo.expenses.create(params.input),
    onSuccess: (_id, variables) => {
      invalidateTrip(client, tripId);
      if (variables.expenseId) {
        void client.invalidateQueries({ queryKey: keys.expense(variables.expenseId) });
      }
    },
  });
}

export function useDeleteExpense(tripId: Uuid) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (expenseId: Uuid) => repo.expenses.softDelete(expenseId),
    onSuccess: () => invalidateTrip(client, tripId),
  });
}

// ---------------------------------------------------------------------------
// Balances and settlements
// ---------------------------------------------------------------------------

export function useBalances(tripId: Uuid | undefined) {
  return useQuery({
    ...live,
    queryKey: keys.balances(tripId ?? 'none'),
    queryFn: () => repo.balances.forTrip(tripId as Uuid),
    enabled: Boolean(tripId),
  });
}

/** Every balance across every trip, for the Home summary. One request. */
export function useAllBalances(enabled = true) {
  return useQuery({
    ...live,
    queryKey: ['balances', 'all'],
    queryFn: () => repo.balances.forAllTrips(),
    enabled,
  });
}

/** The caller's own member row in every trip they belong to. */
export function useMyMemberships(userId: Uuid | undefined) {
  return useQuery({
    ...live,
    queryKey: ['memberships', userId ?? 'anon'],
    queryFn: () => repo.members.mine(userId as Uuid),
    enabled: Boolean(userId),
  });
}

export function useSettlements(tripId: Uuid | undefined) {
  return useQuery({
    ...live,
    queryKey: keys.settlements(tripId ?? 'none'),
    queryFn: () => repo.settlements.listForTrip(tripId as Uuid),
    enabled: Boolean(tripId),
  });
}

export function useRecordSettlement(tripId: Uuid) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      fromMember: Uuid;
      toMember: Uuid;
      amountCents: number;
      createdBy: Uuid;
      note?: string | null;
    }) => repo.settlements.record({ tripId, ...params }),
    onSuccess: () => invalidateTrip(client, tripId),
  });
}

/**
 * Anything that moves money invalidates the whole trip's derived state — and
 * the cross-trip aggregates Home is built from.
 *
 * The two prefix keys are the point. Home reads `['balances', 'all']` and
 * `['memberships', userId]`, and query keys match by prefix, so invalidating
 * `['balances', tripId]` never touched the summary: adding an expense updated
 * the trip screen and left Home showing the old figures until a hard reload.
 * Invalidating the `['balances']` and `['memberships']` prefixes covers the
 * per-trip and the all-trips readers together. It costs nothing extra —
 * invalidation only re-requests queries that are currently mounted.
 */
function invalidateTrip(client: QueryClient, tripId: Uuid): void {
  void client.invalidateQueries({ queryKey: keys.expenses(tripId) });
  void client.invalidateQueries({ queryKey: keys.settlements(tripId) });
  void client.invalidateQueries({ queryKey: keys.members(tripId) });
  void client.invalidateQueries({ queryKey: keys.trips });
  invalidateOverview(client);
}

/**
 * The cross-trip aggregates Home is built from.
 *
 * Prefix keys, so one call covers a single trip's readers and the all-trips
 * ones: `['balances']` matches both `['balances', tripId]` and
 * `['balances', 'all']`.
 */
function invalidateOverview(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: ['balances'] });
  void client.invalidateQueries({ queryKey: ['memberships'] });
}
