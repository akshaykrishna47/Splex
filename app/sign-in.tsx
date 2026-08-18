import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { authRepo } from '@/lib/repo/auth';
import { useSessionStore } from '@/lib/stores/session';
import { colors, spacing } from '@/lib/theme';

type Mode = 'sign-in' | 'sign-up' | 'magic-link';

export default function SignInScreen() {
  const router = useRouter();
  const session = useSessionStore((s) => s.session);
  const pendingInviteCode = useSessionStore((s) => s.pendingInviteCode);
  const setPendingInviteCode = useSessionStore((s) => s.setPendingInviteCode);

  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // The invite flow: a logged-out user who opened /join/[code] gets sent here,
  // and must land back on that invite once they have a session.
  useEffect(() => {
    if (!session) return;
    if (pendingInviteCode) {
      const code = pendingInviteCode;
      setPendingInviteCode(null);
      router.replace(`/join/${code}`);
    } else {
      router.replace('/');
    }
  }, [session, pendingInviteCode, setPendingInviteCode, router]);

  async function submit() {
    setError(null);
    setNotice(null);

    if (!email.trim()) return setError('Enter your email address.');
    if (mode !== 'magic-link' && password.length < 6) {
      return setError('Password must be at least 6 characters.');
    }
    if (mode === 'sign-up' && !displayName.trim()) {
      return setError('Enter the name your trip-mates will see.');
    }

    setBusy(true);
    try {
      const redirectTo = redirectUrl(pendingInviteCode);

      if (mode === 'sign-in') {
        await authRepo.signInWithPassword(email.trim(), password);
      } else if (mode === 'sign-up') {
        const { needsConfirmation } = await authRepo.signUpWithPassword(
          email.trim(),
          password,
          displayName.trim(),
          redirectTo,
        );
        if (needsConfirmation) {
          // No "then sign in": the confirmation link carries a session, so
          // following it lands straight in the app.
          setNotice('Check your email and confirm your address to finish signing up.');
        }
      } else {
        await authRepo.sendMagicLink(email.trim(), redirectTo);
        setNotice(`Magic link sent to ${email.trim()}. Open it on this device.`);
      }
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}>
          <Logo size={96} />
          <Text variant="display">Splex</Text>
          <Text variant="body" tone="muted" align="center">
            Split trip expenses across currencies without the arithmetic.
          </Text>
        </View>

        <Card padding="lg" style={styles.card}>
          <View style={styles.tabs}>
            {(['sign-in', 'sign-up'] as const).map((m) => (
              <Button
                key={m}
                label={m === 'sign-in' ? 'Sign in' : 'Create account'}
                variant={mode === m ? 'secondary' : 'ghost'}
                size="sm"
                onPress={() => {
                  setMode(m);
                  setError(null);
                  setNotice(null);
                }}
                style={styles.tab}
              />
            ))}
          </View>

          {mode === 'sign-up' ? (
            <Input
              label="Display name"
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Aditi"
              autoCapitalize="words"
              textContentType="name"
            />
          ) : null}

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

          {mode !== 'magic-link' ? (
            <Input
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="At least 6 characters"
              secureTextEntry
              autoCapitalize="none"
              textContentType="password"
            />
          ) : null}

          {error ? (
            <Text variant="caption" tone="negative">
              {error}
            </Text>
          ) : null}
          {notice ? (
            <Text variant="caption" tone="positive">
              {notice}
            </Text>
          ) : null}

          <Button
            label={
              mode === 'sign-in' ? 'Sign in' : mode === 'sign-up' ? 'Create account' : 'Email me a link'
            }
            onPress={submit}
            loading={busy}
            fullWidth
          />

          <Button
            label={mode === 'magic-link' ? 'Use a password instead' : 'Email me a magic link instead'}
            variant="ghost"
            size="sm"
            onPress={() => {
              setMode(mode === 'magic-link' ? 'sign-in' : 'magic-link');
              setError(null);
              setNotice(null);
            }}
          />
        </Card>

        {pendingInviteCode ? (
          <Text variant="caption" tone="muted" align="center">
            You&apos;ll join the trip you were invited to right after signing in.
          </Text>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Magic links and confirmations must return to the invite, not the root. */
function redirectUrl(inviteCode: string | null): string {
  return Linking.createURL(inviteCode ? `/join/${inviteCode}` : '/');
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
  tabs: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xs },
  tab: { flex: 1 },
});
