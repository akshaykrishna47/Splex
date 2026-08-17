import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { CreateTripSheet } from '@/components/CreateTripSheet';
import { DebtSummary } from '@/components/DebtSummary';
import { Greeting } from '@/components/Greeting';
import { Screen } from '@/components/Screen';
import { TripCard } from '@/components/TripCard';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Text } from '@/components/ui/Text';
import { useAllBalances, useCurrencies, useMyMemberships, useProfile, useTrips } from '@/lib/queries';
import { indexCurrencies } from '@/lib/money';
import { buildDebtSummary } from '@/lib/overview';
import { useSessionStore } from '@/lib/stores/session';
import { spacing } from '@/lib/theme';

/** Home. A short overview and the fastest route to the next action. */
export default function HomeScreen() {
  const router = useRouter();
  const session = useSessionStore((s) => s.session);
  const { data: profile } = useProfile(session?.user.id);
  const trips = useTrips();
  const [creating, setCreating] = useState(false);

  const balances = useAllBalances(Boolean(session));
  const memberships = useMyMemberships(session?.user.id);
  const { data: currencyRows = [] } = useCurrencies();

  const active = useMemo(() => (trips.data ?? []).filter((t) => !t.archived_at), [trips.data]);
  const recent = active.slice(0, 4);

  const currencies = useMemo(() => indexCurrencies(currencyRows), [currencyRows]);

  // Archived trips still count: money owed does not stop being owed because
  // the trip was tidied away.
  const summary = useMemo(
    () =>
      buildDebtSummary({
        trips: trips.data ?? [],
        balances: balances.data ?? [],
        myMemberIds: new Set((memberships.data ?? []).map((m) => m.id)),
      }),
    [trips.data, balances.data, memberships.data],
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Home' }} />

      <Screen
        loading={trips.isLoading}
        error={trips.error}
        onRefresh={() => {
          void trips.refetch();
          void balances.refetch();
        }}
        refreshing={trips.isRefetching}
      >
        <View style={styles.greeting}>
          <Text variant="caption" tone="muted" weight="600" style={styles.eyebrow}>
            WELCOME BACK
          </Text>
          <Greeting displayName={profile?.display_name} email={session?.user.email} />
        </View>

        {active.length === 0 ? (
          <EmptyState
            icon="trips"
            title="Your trips will appear here"
            message="Create your first trip and start tracking expenses together — add the people coming along, log what you spend, and Splex works out who owes whom."
            actionLabel="Create a trip"
            onAction={() => setCreating(true)}
            secondaryLabel="How it works"
            onSecondary={() => router.push('/about')}
          />
        ) : (
          <Card padding="lg" style={styles.hero}>
            <Text variant="heading">
              {active.length} active {active.length === 1 ? 'trip' : 'trips'}
            </Text>
            <Text variant="body" tone="muted">
              Add an expense as it happens and Splex keeps track of who owes whom.
            </Text>

            <View style={styles.heroActions}>
              <Button label="Create trip" onPress={() => setCreating(true)} />
              <Button label="View all trips" variant="secondary" onPress={() => router.push('/trips')} />
            </View>
          </Card>
        )}

        {active.length > 0 ? (
          <DebtSummary
            summary={summary}
            currencies={currencies}
            loading={balances.isLoading || memberships.isLoading}
          />
        ) : null}

        {recent.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text variant="label" tone="faint" style={styles.sectionTitle}>
                RECENT TRIPS
              </Text>
              {active.length > recent.length ? (
                <Button label="See all" variant="ghost" size="sm" onPress={() => router.push('/trips')} />
              ) : null}
            </View>

            {recent.map((trip) => (
              <TripCard key={trip.id} trip={trip} showArchive={false} />
            ))}
          </View>
        ) : null}
      </Screen>

      <CreateTripSheet visible={creating} onClose={() => setCreating(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  // Extra breathing room under the name before the first card. The script face
  // is set large, so the default column gap left it crowding what follows.
  greeting: { gap: spacing.xs, marginBottom: spacing.lg },
  eyebrow: { letterSpacing: 0.8 },
  hero: { gap: spacing.md },
  heroActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  section: { gap: spacing.sm, marginTop: spacing.md },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { letterSpacing: 0.6 },
});
