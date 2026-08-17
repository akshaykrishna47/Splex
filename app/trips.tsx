import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { CreateTripSheet } from '@/components/CreateTripSheet';
import { Screen } from '@/components/Screen';
import { TripCard } from '@/components/TripCard';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Fab } from '@/components/ui/Fab';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { useTrips } from '@/lib/queries';
import { spacing } from '@/lib/theme';

/** My Trips. Every trip, active and archived, with search. */
export default function TripsScreen() {
  const router = useRouter();
  // The About page's "Create a trip" buttons link here with ?new=1, so the
  // sheet can be opened from elsewhere without duplicating it into every screen.
  const { new: openNew } = useLocalSearchParams<{ new?: string }>();

  const trips = useTrips();
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    if (openNew === '1') {
      setCreating(true);
      router.setParams({ new: undefined });
    }
  }, [openNew, router]);

  const { active, archived } = useMemo(() => {
    const term = query.trim().toLowerCase();
    const all = (trips.data ?? []).filter((t) => !term || t.name.toLowerCase().includes(term));
    return {
      active: all.filter((t) => !t.archived_at),
      archived: all.filter((t) => t.archived_at),
    };
  }, [trips.data, query]);

  const hasAny = (trips.data ?? []).length > 0;

  return (
    <>
      <Stack.Screen options={{ title: 'My Trips' }} />

      <Screen
        loading={trips.isLoading}
        error={trips.error}
        onRefresh={() => void trips.refetch()}
        refreshing={trips.isRefetching}
        fab={<Fab label="Create trip" onPress={() => setCreating(true)} />}
      >
        <View style={styles.header}>
          <Text variant="title">My Trips</Text>
          <Text variant="caption" tone="muted">
            {active.length} active
            {archived.length > 0 ? ` · ${archived.length} archived` : ''}
          </Text>
        </View>

        {hasAny ? (
          <Input value={query} onChangeText={setQuery} placeholder="Search trips" autoCorrect={false} />
        ) : null}

        {active.length === 0 ? (
          hasAny ? (
            <EmptyState
              icon="search"
              title="No matching trips"
              message="Nothing here matches that search. Try a different name, or check the archived list below."
              actionLabel="Clear search"
              onAction={() => setQuery('')}
            />
          ) : (
            <EmptyState
              icon="trips"
              title="Your trips will appear here"
              message="Create your first trip and start tracking expenses together."
              actionLabel="Create a trip"
              onAction={() => setCreating(true)}
              secondaryLabel="How it works"
              onSecondary={() => router.push('/about')}
            />
          )
        ) : (
          active.map((trip) => <TripCard key={trip.id} trip={trip} />)
        )}

        {archived.length > 0 ? (
          <View style={styles.section}>
            <Button
              label={`${showArchived ? 'Hide' : 'Show'} archived (${archived.length})`}
              variant="ghost"
              size="sm"
              onPress={() => setShowArchived((v) => !v)}
            />
            {showArchived ? archived.map((trip) => <TripCard key={trip.id} trip={trip} />) : null}
          </View>
        ) : null}
      </Screen>

      <CreateTripSheet visible={creating} onClose={() => setCreating(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.xs },
  empty: { gap: spacing.sm },
  section: { gap: spacing.sm, marginTop: spacing.md },
});
