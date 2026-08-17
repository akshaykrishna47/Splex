import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Screen, messageFor } from '@/components/Screen';
import { Icon } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { useInvitePreview, useJoinTrip } from '@/lib/queries';
import { useSessionStore } from '@/lib/stores/session';
import { colors, radius, spacing } from '@/lib/theme';

export default function JoinScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const router = useRouter();

  const session = useSessionStore((s) => s.session);
  const ready = useSessionStore((s) => s.ready);
  const setPendingInviteCode = useSessionStore((s) => s.setPendingInviteCode);

  const preview = useInvitePreview(session ? code : undefined);
  const join = useJoinTrip();

  const [claimId, setClaimId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * A logged-out visitor gets parked at sign-in with the code remembered, and
   * is sent straight back here once they have a session.
   */
  useEffect(() => {
    if (!ready || session || !code) return;
    setPendingInviteCode(code);
    router.replace('/sign-in');
  }, [ready, session, code, setPendingInviteCode, router]);

  // Already in this trip: skip the ceremony.
  useEffect(() => {
    if (preview.data?.already_member) {
      router.replace(`/trip/${preview.data.trip_id}`);
    }
  }, [preview.data, router]);

  async function accept() {
    if (!code) return;
    setError(null);
    try {
      const tripId = await join.mutateAsync({ code, claimMemberId: claimId });
      router.replace(`/trip/${tripId}`);
    } catch (e) {
      setError(messageFor(e));
    }
  }

  if (!ready || !session) {
    return (
      <>
        <Stack.Screen options={{ title: 'Join trip' }} />
        <Screen loading />
      </>
    );
  }

  if (preview.isLoading) {
    return (
      <>
        <Stack.Screen options={{ title: 'Join trip' }} />
        <Screen loading />
      </>
    );
  }

  if (!preview.data) {
    return (
      <>
        <Stack.Screen options={{ title: 'Join trip' }} />
        <Screen>
          <Card padding="lg" style={styles.block}>
            <Text variant="heading">That invite didn&apos;t work</Text>
            <Text variant="body" tone="muted">
              The code <Text weight="600">{code}</Text> doesn&apos;t match an active trip. It may
              have been mistyped, or the trip may have been archived.
            </Text>
            <Button label="Back to trips" onPress={() => router.replace('/')} />
          </Card>
        </Screen>
      </>
    );
  }

  const trip = preview.data;
  const unclaimed = trip.unclaimed_members ?? [];

  return (
    <>
      <Stack.Screen options={{ title: 'Join trip' }} />

      <Screen
        footer={
          <Button
            label={claimId ? 'Join as this person' : 'Join as someone new'}
            size="lg"
            fullWidth
            onPress={accept}
            loading={join.isPending}
          />
        }
      >
        <Card padding="lg" style={styles.block}>
          <Text variant="label" tone="muted">
            You&apos;ve been invited to
          </Text>
          <Text variant="title">{trip.name}</Text>
          <Text variant="caption" tone="muted">
            {trip.member_count} {trip.member_count === 1 ? 'person' : 'people'} · settles in{' '}
            {trip.base_currency}
          </Text>
        </Card>

        {unclaimed.length > 0 ? (
          <Card padding="lg" style={styles.block}>
            <Text variant="heading">Are you already on this list?</Text>
            <Text variant="caption" tone="muted">
              Someone added these names before you joined. Pick yours and your account links to
              that person — including any expenses already assigned to them. Otherwise you&apos;ll
              be added as someone new.
            </Text>

            <View style={styles.options}>
              {unclaimed.map((member) => {
                const selected = claimId === member.id;
                return (
                  <Pressable
                    key={member.id}
                    onPress={() => setClaimId(selected ? null : member.id)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    style={[styles.option, selected && styles.optionSelected]}
                  >
                    <Avatar name={member.display_name} size={32} />
                    <Text variant="body" weight={selected ? '600' : '400'} style={styles.optionText}>
                      {member.display_name}
                    </Text>
                    {selected ? (
                      <Icon name="check" size={16} color={colors.primaryText} />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </Card>
        ) : null}

        {error ? (
          <Text variant="caption" tone="negative">
            {error}
          </Text>
        ) : null}
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  block: { gap: spacing.sm },
  options: { gap: spacing.sm, marginTop: spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  optionSelected: { borderColor: colors.primary, backgroundColor: colors.primaryMuted },
  optionText: { flex: 1 },
});
