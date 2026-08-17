import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { Icon } from './ui/Icon';
import { Text } from './ui/Text';
import { useToast } from './ui/Toast';
import { useSetTripArchived } from '@/lib/queries';
import { colors, radius, spacing } from '@/lib/theme';
import type { TripSummary } from '@/lib/repo';

export type TripCardProps = {
  trip: TripSummary;
  /** Hides the archive control where it would be noise, e.g. on Home. */
  showArchive?: boolean;
};

/**
 * One row in a trip list. Shared by Home and My Trips.
 *
 * The card itself is deliberately NOT pressable: a pressable Button inside a
 * pressable Card nests two interactive elements, and on web the click bubbles,
 * so "Archive" would also navigate into the trip. Only the text opens it.
 */
export function TripCard({ trip, showArchive = true }: TripCardProps) {
  const router = useRouter();
  const toast = useToast();
  const setArchived = useSetTripArchived();
  const [confirming, setConfirming] = useState(false);

  const archived = Boolean(trip.archived_at);

  async function toggleArchive() {
    try {
      await setArchived.mutateAsync({ tripId: trip.id, archived: !archived });
      setConfirming(false);
      toast.success(archived ? 'Trip restored' : 'Trip archived');
    } catch (e) {
      setConfirming(false);
      toast.error(e, `Could not ${archived ? 'restore' : 'archive'} the trip.`);
    }
  }

  return (
    <>
      <Card style={archived ? styles.dimmed : undefined}>
        <View style={styles.row}>
          <Pressable
            onPress={() => router.push(`/trip/${trip.id}`)}
            accessibilityRole="button"
            accessibilityLabel={`Open ${trip.name}`}
            style={({ pressed }) => [styles.pressArea, pressed && styles.pressed]}
          >
            <View style={styles.icon}>
              {trip.emoji ? (
                <Text style={styles.emoji}>{trip.emoji}</Text>
              ) : (
                <Icon name="trips" size={20} color={colors.textMuted} />
              )}
            </View>

            <View style={styles.text}>
              <Text variant="heading" numberOfLines={1}>
                {trip.name}
              </Text>
              {trip.description ? (
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  {trip.description}
                </Text>
              ) : null}
              <Text variant="caption" tone="faint">
                {trip.member_count} {trip.member_count === 1 ? 'person' : 'people'} · settles in{' '}
                {trip.base_currency}
              </Text>
            </View>
          </Pressable>

          {showArchive ? (
            <Button
              label={archived ? 'Restore' : 'Archive'}
              variant="ghost"
              size="sm"
              // Restoring is harmless; archiving hides the trip, so it asks first.
              onPress={archived ? toggleArchive : () => setConfirming(true)}
              loading={setArchived.isPending}
            />
          ) : null}
        </View>
      </Card>

      <ConfirmDialog
        visible={confirming}
        onCancel={() => setConfirming(false)}
        onConfirm={toggleArchive}
        title="Archive this trip?"
        message={`"${trip.name}" moves out of your active list. Nothing is deleted — every expense, balance and payment stays exactly as it is, and you can restore it at any time.`}
        confirmLabel="Archive trip"
        loading={setArchived.isPending}
      />
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  pressArea: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, minWidth: 0 },
  pressed: { opacity: 0.6 },
  icon: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  emoji: { fontSize: 20 },
  // minWidth 0 lets long names ellipsize instead of pushing the button away.
  text: { flex: 1, gap: 2, minWidth: 0, paddingVertical: spacing.xs },
  dimmed: { opacity: 0.6 },
});
