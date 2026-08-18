import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { authRepo } from '@/lib/repo/auth';
import { useSessionStore } from '@/lib/stores/session';
import { colors, spacing } from '@/lib/theme';

/**
 * Step two of recovery: where the emailed link lands.
 *
 * There is no "current password" field and that is not an oversight. Following
 * the link establishes a real session — that possession of the inbox IS the
 * proof — so the only thing left to collect is the new password.
 *
 * Which also means a missing session here has exactly one meaning: the link was
 * expired, already used, or opened in a different browser than it was requested
 * from. Worth saying plainly, because an empty form with a dead Save button is
 * the kind of thing people retry five times before giving up.
 */
export default function ResetPasswordScreen() {
  const router = useRouter();
  const session = useSessionStore((s) => s.session);
  const ready = useSessionStore((s) => s.ready);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);

    if (password.length < 6) return setError('Password must be at least 6 characters.');
    if (password !== confirm) return setError('The two passwords do not match.');

    setBusy(true);
    try {
      await authRepo.updatePassword(password);
      // Already authenticated by the recovery link, so there is nothing to sign
      // in to — go straight to the app.
      router.replace('/');
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: 'New password' }} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <Logo size={72} />
            <Text variant="title">Choose a new password</Text>
          </View>

          <Card padding="lg" style={styles.card}>
            {ready && !session ? (
              <>
                <Text variant="body" tone="negative">
                  This reset link is no longer valid.
                </Text>
                <Text variant="caption" tone="muted">
                  Links expire after an hour and can only be used once. Opening one in a different
                  browser than you requested it from has the same effect.
                </Text>
                <Button
                  label="Send a new link"
                  onPress={() => router.replace('/forgot-password')}
                  fullWidth
                />
              </>
            ) : (
              <>
                <Input
                  label="New password"
                  value={password}
                  onChangeText={setPassword}
                  placeholder="At least 6 characters"
                  secureTextEntry
                  autoCapitalize="none"
                  textContentType="newPassword"
                />
                <Input
                  label="Confirm new password"
                  value={confirm}
                  onChangeText={setConfirm}
                  placeholder="Type it again"
                  secureTextEntry
                  autoCapitalize="none"
                  textContentType="newPassword"
                />

                {error ? (
                  <Text variant="caption" tone="negative">
                    {error}
                  </Text>
                ) : null}

                <Button
                  label="Save new password"
                  onPress={submit}
                  loading={busy}
                  disabled={!ready}
                  fullWidth
                />
              </>
            )}
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

function messageFor(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: string }).message);
  return 'Something went wrong. Try again.';
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
    gap: spacing.xl,
  },
  brand: { alignItems: 'center', gap: spacing.sm, maxWidth: 340 },
  card: { width: '100%', maxWidth: 400, gap: spacing.md },
});
