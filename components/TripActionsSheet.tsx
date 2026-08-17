import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from './ui/Button';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { Icon } from './ui/Icon';
import { Input } from './ui/Input';
import { Sheet } from './ui/Sheet';
import { Text } from './ui/Text';
import { useToast } from './ui/Toast';
import { friendlyError } from '@/lib/errors';
import { useDeleteTrip, useLeaveTrip, useUpdateTrip } from '@/lib/queries';
import { colors, radius, spacing } from '@/lib/theme';
import type { Trip } from '@/lib/types';

export type TripActionsSheetProps = {
  visible: boolean;
  onClose: () => void;
  trip: Trip | null;
  isOwner: boolean;
};

const TRIP_EMOJI = ['✈️', '🏖️', '🏔️', '🍜', '🎒', '🚗', '🏙️', '🎡', '⛺', '🛳️', '🎿', '🌴'];

/**
 * Trip settings: rename and delete for the owner, leave for everyone.
 *
 * Ownership is not a UI-only distinction — RLS enforces owner-only delete, so
 * hiding the button is a convenience, not the control.
 */
export function TripActionsSheet({ visible, onClose, trip, isOwner }: TripActionsSheetProps) {
  const router = useRouter();
  const toast = useToast();

  const updateTrip = useUpdateTrip(trip?.id ?? '');
  const deleteTrip = useDeleteTrip();
  const leaveTrip = useLeaveTrip(trip?.id ?? '');

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [emoji, setEmoji] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed each time it opens, so an abandoned edit doesn't persist.
  useEffect(() => {
    if (!visible || !trip) return;
    setName(trip.name);
    setDescription(trip.description ?? '');
    setEmoji(trip.emoji);
    setError(null);
  }, [visible, trip]);

  const dirty =
    Boolean(trip) &&
    (name.trim() !== trip?.name ||
      description.trim() !== (trip?.description ?? '') ||
      emoji !== trip?.emoji);

  async function save() {
    if (!trip) return;
    if (!name.trim()) return setError('Give the trip a name.');

    setError(null);
    try {
      await updateTrip.mutateAsync({ name, description, emoji });
      toast.success('Trip updated');
      onClose();
    } catch (e) {
      const message = friendlyError(e, 'Could not update the trip.');
      setError(message);
      toast.error(e, message);
    }
  }

  async function remove() {
    if (!trip) return;
    try {
      await deleteTrip.mutateAsync(trip.id);
      setConfirmDelete(false);
      onClose();
      toast.success('Trip deleted');
      router.replace('/trips');
    } catch (e) {
      setConfirmDelete(false);
      toast.error(e, 'Could not delete the trip.');
    }
  }

  async function leave() {
    if (!trip) return;
    try {
      await leaveTrip.mutateAsync();
      setConfirmLeave(false);
      onClose();
      toast.success(`You left ${trip.name}`);
      router.replace('/trips');
    } catch (e) {
      setConfirmLeave(false);
      // The RPC's refusals are already written for people — "Settle up before
      // leaving", "You are the only person on this trip" — so they surface as-is.
      toast.error(e, 'Could not leave the trip.');
    }
  }

  return (
    <>
      <Sheet
        visible={visible && !confirmDelete && !confirmLeave}
        onClose={onClose}
        title="Trip settings"
        footer={
          isOwner ? (
            <Button
              label="Save changes"
              onPress={save}
              disabled={!dirty}
              loading={updateTrip.isPending}
              fullWidth
            />
          ) : undefined
        }
      >
        {isOwner ? (
          <View style={styles.form}>
            <View>
              <Text variant="caption" tone="muted" weight="600" style={styles.fieldLabel}>
                ICON
              </Text>
              <View style={styles.emojiRow}>
                {TRIP_EMOJI.map((option) => {
                  const active = emoji === option;
                  return (
                    <Pressable
                      key={option}
                      onPress={() => setEmoji(active ? null : option)}
                      accessibilityRole="button"
                      accessibilityLabel={`Trip icon ${option}`}
                      accessibilityState={{ selected: active }}
                      style={[styles.emojiTile, active && styles.emojiTileActive]}
                    >
                      <Text style={styles.emoji}>{option}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <Input label="Trip name" value={name} onChangeText={setName} placeholder="Japan Summer Trip" />

            <Input
              label="Description"
              value={description}
              onChangeText={setDescription}
              placeholder="Tokyo, Osaka and Kyoto with the group"
              hint="Optional."
              multiline
              maxLength={280}
            />

            {error ? (
              <Text variant="caption" tone="negative">
                {error}
              </Text>
            ) : null}
          </View>
        ) : (
          <Text variant="body" tone="muted" style={styles.readonly}>
            Only the trip owner can rename or delete this trip.
          </Text>
        )}

        <View style={styles.danger}>
          <Text variant="caption" tone="faint" weight="600" style={styles.fieldLabel}>
            LEAVING
          </Text>

          <Pressable
            onPress={() => setConfirmLeave(true)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          >
            <Icon name="sign-out" size={20} color={colors.textMuted} />
            <View style={styles.rowText}>
              <Text variant="body">Leave this trip</Text>
              <Text variant="caption" tone="faint">
                You&apos;ll need a zero balance first.
              </Text>
            </View>
          </Pressable>

          {isOwner ? (
            <Pressable
              onPress={() => setConfirmDelete(true)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            >
              <Icon name="delete" size={20} color={colors.negative} />
              <View style={styles.rowText}>
                <Text variant="body" tone="negative">
                  Delete this trip
                </Text>
                <Text variant="caption" tone="faint">
                  Removes every expense and balance, for everyone.
                </Text>
              </View>
            </Pressable>
          ) : null}
        </View>
      </Sheet>

      <ConfirmDialog
        visible={confirmLeave}
        onCancel={() => setConfirmLeave(false)}
        onConfirm={leave}
        title={`Leave ${trip?.name ?? 'this trip'}?`}
        message="You'll stop seeing this trip and won't be included in new expenses. Everything you've already paid for or owed stays in the trip's history. You can be invited back."
        confirmLabel="Leave trip"
        destructive
        loading={leaveTrip.isPending}
      />

      <ConfirmDialog
        visible={confirmDelete}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={remove}
        title={`Delete ${trip?.name ?? 'this trip'}?`}
        message="This permanently removes the trip and every expense, split and payment in it — for everyone, not just you. It cannot be undone."
        confirmLabel="Delete permanently"
        destructive
        loading={deleteTrip.isPending}
      />
    </>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.lg, paddingTop: spacing.sm },
  fieldLabel: { marginBottom: spacing.sm, letterSpacing: 0.8 },
  readonly: { paddingVertical: spacing.md },

  emojiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  emojiTile: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
  },
  emojiTileActive: { borderColor: colors.primary, backgroundColor: colors.primaryMuted },
  emoji: { fontSize: 20 },

  danger: {
    marginTop: spacing.xl,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  rowPressed: { backgroundColor: colors.surfaceMuted },
  rowText: { flex: 1, gap: 1 },
});
