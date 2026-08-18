import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import * as Linking from 'expo-linking';
import { Stack, useRouter } from 'expo-router';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { authRepo } from '@/lib/repo/auth';
import { colors, spacing } from '@/lib/theme';

/**
 * Step one of recovery: ask for the address, send the link.
 *
 * The response is deliberately identical whether or not an account exists.
 * Signup already tells you an address is taken — it has to, or people cannot
 * work out why it failed — but there is no equivalent reason to confirm it
 * here, and doing so would turn this screen into a free membership oracle for
 * anyone who wants one.
 */
export default function ForgotPasswordScreen() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit() {
    setError(null);
    if (!email.trim()) return setError('Enter your email address.');

    setBusy(true);
    try {
      // Where the link lands. Must be allow-listed in the project's auth
      // settings, or Supabase quietly swaps in the Site URL instead.
      await authRepo.sendPasswordReset(email.trim(), Linking.createURL('/reset-password'));
      setSent(true);
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Reset password' }} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <Logo size={72} />
            <Text variant="title">Reset your password</Text>
          </View>

          <Card padding="lg" style={styles.card}>
            {sent ? (
              <>
                <Text variant="body">
                  If an account exists for {email.trim()}, a reset link is on its way.
                </Text>
                <Text variant="caption" tone="muted">
                  The link opens a page where you can choose a new password. It expires after an
                  hour.
                </Text>
                <Button label="Back to sign in" onPress={() => router.replace('/sign-in')} fullWidth />
              </>
            ) : (
              <>
                <Text variant="body" tone="muted">
                  Enter your email address and we&apos;ll send you a link to set a new password.
                </Text>

                <Input
                  label="Email"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="emailAddress"
                />

                {error ? (
                  <Text variant="caption" tone="negative">
                    {error}
                  </Text>
                ) : null}

                <Button label="Send reset link" onPress={submit} loading={busy} fullWidth />
                <Button
                  label="Back to sign in"
                  variant="ghost"
                  size="sm"
                  onPress={() => router.replace('/sign-in')}
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
