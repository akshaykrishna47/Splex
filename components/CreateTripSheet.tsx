import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CurrencyPicker } from './CurrencyPicker';
import { Icon } from './ui/Icon';
import { useToast } from './ui/Toast';
import { friendlyError } from '@/lib/errors';
import { Avatar } from './ui/Avatar';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Sheet } from './ui/Sheet';
import { Text } from './ui/Text';
import { useCreateTrip, useCurrencies } from '@/lib/queries';
import { usePrefsStore } from '@/lib/stores/prefs';
import { colors, radius, spacing } from '@/lib/theme';

export type CreateTripSheetProps = {
  visible: boolean;
  onClose: () => void;
};

/** A small fixed set, so picking an icon is one tap and never a search box. */
const TRIP_EMOJI = ['✈️', '🏖️', '🏔️', '🍜', '🎒', '🚗', '🏙️', '🎡', '⛺', '🛳️', '🎿', '🌴'];

/**
 * Create a trip and its initial participants in one step.
 *
 * The whole thing is a single `create_trip` RPC call, so a trip can never end
 * up half-created with some participants missing.
 */
export function CreateTripSheet({ visible, onClose }: CreateTripSheetProps) {
  const router = useRouter();
  const toast = useToast();
  const createTrip = useCreateTrip();
  const { data: currencies = [] } = useCurrencies();
  const recentCurrencies = usePrefsStore((s) => s.recentCurrencies);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [emoji, setEmoji] = useState<string | null>(null);
  const [baseCurrency, setBaseCurrency] = useState('USD');
  const [participant, setParticipant] = useState('');
  const [participants, setParticipants] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName('');
    setDescription('');
    setEmoji(null);
    setBaseCurrency('USD');
    setParticipant('');
    setParticipants([]);
    setError(null);
  }

  function addParticipant() {
    const trimmed = participant.trim();
    if (!trimmed) return;

    // Case-insensitive duplicate check: two people called "Sam" in one trip is
    // impossible to reason about on the balances screen.
    if (participants.some((p) => p.toLowerCase() === trimmed.toLowerCase())) {
      setError(`${trimmed} is already on the list.`);
      return;
    }

    setParticipants((prev) => [...prev, trimmed]);
    setParticipant('');
    setError(null);
  }

  async function submit() {
    if (!name.trim()) {
      setError('Give the trip a name.');
      return;
    }

    setError(null);
    try {
      // Anything left in the box counts — nobody should lose a name because
      // they didn't press Add before Create.
      const pending = participant.trim();
      const names = pending && !participants.includes(pending) ? [...participants, pending] : participants;

      const trip = await createTrip.mutateAsync({
        name: name.trim(),
        baseCurrency,
        memberNames: names,
        description,
        emoji,
      });
      reset();
      onClose();
      toast.success('Trip created');
      router.push(`/trip/${trip.id}`);
    } catch (e) {
      const message = friendlyError(e, 'Could not create the trip. Please try again.');
      setError(message);
      toast.error(e, message);
    }
  }

  return (
    <>
      <Sheet
        visible={visible}
        onClose={() => {
          onClose();
          setError(null);
        }}
        title="New trip"
        footer={
          <Button
            label="Create trip"
            onPress={submit}
            loading={createTrip.isPending}
            disabled={!name.trim()}
            fullWidth
          />
        }
      >
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

          <Input
            label="Trip name"
            value={name}
            onChangeText={(text) => {
              setName(text);
              if (error) setError(null);
            }}
            placeholder="Japan Summer Trip"
            autoFocus
            returnKeyType="next"
          />

          <Input
            label="Description"
            value={description}
            onChangeText={setDescription}
            placeholder="Tokyo, Osaka and Kyoto with the group"
            hint="Optional."
            multiline
            maxLength={280}
          />

          <View>
            <Text variant="caption" tone="muted" weight="600" style={styles.fieldLabel}>
              SETTLE-UP CURRENCY
            </Text>
            <Button label={baseCurrency} variant="secondary" onPress={() => setPickerOpen(true)} fullWidth />
            <Text variant="caption" tone="faint" style={styles.hint}>
              Balances are calculated and settled in {baseCurrency}. Expenses can still be entered
              in any currency. This can&apos;t be changed later.
            </Text>
          </View>

          <View>
            <Text variant="caption" tone="muted" weight="600" style={styles.fieldLabel}>
              WHO&apos;S COMING?
            </Text>

            <View style={styles.addRow}>
              <Input
                value={participant}
                onChangeText={setParticipant}
                placeholder="Add a name"
                containerStyle={styles.addInput}
                onSubmitEditing={addParticipant}
                returnKeyType="done"
                autoCapitalize="words"
              />
              <Button label="Add" variant="secondary" onPress={addParticipant} disabled={!participant.trim()} />
            </View>

            {participants.length > 0 ? (
              <View style={styles.chips}>
                {participants.map((person) => (
                  <View key={person} style={styles.chip}>
                    <Avatar name={person} size={20} />
                    <Text variant="caption">{person}</Text>
                    <Pressable
                      onPress={() => setParticipants((prev) => prev.filter((p) => p !== person))}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${person}`}
                      hitSlop={8}
                    >
                      <Icon name="close" size={16} color={colors.textMuted} />
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}

            <Text variant="caption" tone="faint" style={styles.hint}>
              You&apos;re added automatically. Names are enough — nobody needs an account, and you
              can invite them by link later.
            </Text>
          </View>

          {error ? (
            <Text variant="caption" tone="negative">
              {error}
            </Text>
          ) : null}
        </View>
      </Sheet>

      <CurrencyPicker
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={setBaseCurrency}
        currencies={currencies}
        selected={baseCurrency}
        recent={recentCurrencies}
      />
    </>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.xl, paddingTop: spacing.sm },
  fieldLabel: { marginBottom: spacing.sm, letterSpacing: 0.8 },
  hint: { marginTop: spacing.sm },
  addRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  addInput: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
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
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
