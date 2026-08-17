import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { CurrencyPicker } from '@/components/CurrencyPicker';
import { FxFooter } from '@/components/FxFooter';
import { Screen, messageFor } from '@/components/Screen';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { describeFreshness } from '@/lib/fx';
import { repo } from '@/lib/repo';
import { useCurrencies, useProfile, useRates, useUpdateProfile } from '@/lib/queries';
import { usePrefsStore } from '@/lib/stores/prefs';
import { useSessionStore } from '@/lib/stores/session';
import { spacing } from '@/lib/theme';

export default function SettingsScreen() {
  const router = useRouter();
  const session = useSessionStore((s) => s.session);
  const userId = session?.user.id;

  const profile = useProfile(userId);
  const updateProfile = useUpdateProfile(userId);
  const { data: currencies = [] } = useCurrencies();
  const rates = useRates();
  const recentCurrencies = usePrefsStore((s) => s.recentCurrencies);

  const [displayName, setDisplayName] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (profile.data?.display_name) setDisplayName(profile.data.display_name);
  }, [profile.data?.display_name]);

  const displayCurrency = profile.data?.display_currency ?? null;

  // Freshness of the whole cache, for the "rates last updated" line.
  const newestFetch = (rates.data ?? []).reduce<string | null>(
    (newest, row) => (!newest || row.fetched_at > newest ? row.fetched_at : newest),
    null,
  );

  async function saveProfile() {
    setError(null);
    setStatus(null);
    try {
      await updateProfile.mutateAsync({ display_name: displayName.trim() });
      setStatus('Saved.');
    } catch (e) {
      setError(messageFor(e));
    }
  }

  async function setDisplayCurrency(code: string | null) {
    setError(null);
    try {
      await updateProfile.mutateAsync({ display_currency: code });
    } catch (e) {
      setError(messageFor(e));
    }
  }

  async function signOut() {
    try {
      await repo.auth.signOut();
      router.replace('/sign-in');
    } catch (e) {
      setError(messageFor(e));
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Settings' }} />

      <Screen loading={profile.isLoading}>
        <Card padding="lg" style={styles.block}>
          <View style={styles.identity}>
            <Avatar name={displayName || session?.user.email || '?'} size={48} url={profile.data?.avatar_url} />
            <View style={styles.identityText}>
              <Text variant="heading" numberOfLines={1}>
                {displayName || 'Your name'}
              </Text>
              {profile.data?.username ? (
                <Text variant="caption" tone="primary" weight="600" numberOfLines={1}>
                  @{profile.data.username}
                </Text>
              ) : null}
              <Text variant="caption" tone="muted" numberOfLines={1}>
                {session?.user.email ?? ''}
              </Text>
            </View>
          </View>

          <Text variant="caption" tone="faint">
            @{profile.data?.username ?? '…'} is your Splex username. It was assigned when you
            signed up and stays the same — change your display name below instead.
          </Text>

          <Input
            label="Display name"
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="How your trip-mates see you"
            hint="Used when you join a trip. Existing member names aren't changed."
          />

          <Button
            label="Save"
            onPress={saveProfile}
            loading={updateProfile.isPending}
            variant="secondary"
          />

          {status ? (
            <Text variant="caption" tone="positive">
              {status}
            </Text>
          ) : null}
        </Card>

        <Card padding="lg" style={styles.block}>
          <Text variant="heading">Display currency</Text>
          <Text variant="caption" tone="muted">
            Shows every figure converted into this currency, across all trips. It changes nothing
            about what is stored or what you actually owe — each trip still settles in its own
            currency, and you can override this per trip from the trip header.
          </Text>

          <Button
            label={displayCurrency ?? "Each trip's own currency"}
            variant="secondary"
            onPress={() => setPickerOpen(true)}
            fullWidth
          />

          {displayCurrency ? (
            <Button
              label="Clear"
              variant="ghost"
              size="sm"
              onPress={() => setDisplayCurrency(null)}
            />
          ) : null}
        </Card>

        <Card padding="lg" style={styles.block}>
          <Text variant="heading">Exchange rates</Text>
          <Text variant="caption" tone="muted">
            {newestFetch
              ? `Cached rates ${describeFreshness(newestFetch)}. They refresh every 6 hours.`
              : 'No cached rates yet. They arrive with the next scheduled sync.'}
          </Text>
          <Button
            label="Refresh now"
            variant="secondary"
            size="sm"
            onPress={async () => {
              await repo.fx.requestSync();
              void rates.refetch();
            }}
          />
        </Card>

        <Text variant="caption" tone="faint">
          Rates are mid-market reference rates, not what a bank or card issuer charges. Settlement
          amounts are always authoritative in each trip&apos;s own settle-up currency.
        </Text>

        {error ? (
          <Text variant="caption" tone="negative">
            {error}
          </Text>
        ) : null}

        <Button label="Sign out" variant="ghost" onPress={signOut} />
      </Screen>

      <CurrencyPicker
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        currencies={currencies}
        selected={displayCurrency ?? undefined}
        recent={recentCurrencies}
        onSelect={(code) => setDisplayCurrency(code)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  block: { gap: spacing.md },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  identityText: { flex: 1, gap: 2 },
});
