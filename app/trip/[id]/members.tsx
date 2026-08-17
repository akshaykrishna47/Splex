import { useState } from 'react';
import { Platform, Pressable, Share, StyleSheet, View } from 'react-native';
import * as Linking from 'expo-linking';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Screen } from '@/components/Screen';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { friendlyError } from '@/lib/errors';
import type { TripMember } from '@/lib/types';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import {
  useAddMember,
  useAddMemberByUsername,
  useMembers,
  useMyMembership,
  useRemoveMember,
  useTrip,
} from '@/lib/queries';
import { useSessionStore } from '@/lib/stores/session';
import { colors, spacing } from '@/lib/theme';

export default function MembersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const toast = useToast();
  const session = useSessionStore((s) => s.session);

  const trip = useTrip(id);
  const members = useMembers(id);
  const membership = useMyMembership(id, session?.user.id);
  const addMember = useAddMember(id);
  const addByUsernameMutation = useAddMemberByUsername(id);
  const removeMember = useRemoveMember(id);

  const [username, setUsername] = useState('');
  const [showNameOnly, setShowNameOnly] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [removing, setRemoving] = useState<TripMember | null>(null);

  async function confirmRemove() {
    if (!removing) return;
    try {
      await removeMember.mutateAsync(removing.id);
      toast.success(`${removing.display_name} removed`);
      setRemoving(null);
    } catch (e) {
      setRemoving(null);
      toast.error(e, 'Could not remove that person.');
    }
  }

  const isOwner = membership.data?.role === 'owner';
  const inviteUrl = trip.data ? Linking.createURL(`/join/${trip.data.invite_code}`) : '';

  /**
   * Adds an existing Splex account. The username must match exactly — the
   * lookup does no partial matching, so a typo reports "no such user" rather
   * than silently attaching the wrong person.
   */
  async function addByUsername() {
    const handle = username.trim().replace(/^@/, '');
    if (!handle) return setError('Enter a username.');

    setError(null);
    try {
      const member = await addByUsernameMutation.mutateAsync(handle);
      toast.success(`${member.display_name} added to the trip`);
      setUsername('');
    } catch (e) {
      // The RPC already phrases its refusals for people, e.g. "No Splex user
      // with the username @x." — so they surface unchanged.
      const message = friendlyError(e, 'Could not add that person.');
      setError(message);
      toast.error(e, message);
    }
  }

  async function add() {
    if (!name.trim()) return setError('Enter a name.');
    setError(null);
    try {
      await addMember.mutateAsync(name.trim());
      toast.success(`${name.trim()} added to the trip`);
      setName('');
    } catch (e) {
      const message = friendlyError(e, 'Could not add that person.');
      setError(message);
      toast.error(e, message);
    }
  }

  async function shareInvite() {
    if (!inviteUrl) return;
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(inviteUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } else {
        await Share.share({ message: inviteUrl });
      }
    } catch {
      // User dismissed the share sheet; nothing to report.
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: 'People' }} />

      <Screen loading={trip.isLoading || members.isLoading} error={members.error}>
        <Card padding="lg" style={styles.block}>
          <Text variant="heading">Add someone</Text>
          <Text variant="caption" tone="muted">
            Add an existing Splex account by their username — they&apos;ll see the trip straight
            away. Usernames are assigned at signup and shown in Settings.
          </Text>

          <View style={styles.addRow}>
            <Input
              value={username}
              onChangeText={(text) => {
                setUsername(text);
                if (error) setError(null);
              }}
              placeholder="username"
              leading={
                <Text variant="body" tone="faint">
                  @
                </Text>
              }
              autoCapitalize="none"
              autoCorrect={false}
              containerStyle={styles.addInput}
              onSubmitEditing={addByUsername}
              returnKeyType="done"
            />
            <Button
              label="Add"
              onPress={addByUsername}
              disabled={!username.trim()}
              loading={addByUsernameMutation.isPending}
            />
          </View>

          {error ? (
            <Text variant="caption" tone="negative">
              {error}
            </Text>
          ) : null}

          <Pressable
            onPress={() => setShowNameOnly((v) => !v)}
            accessibilityRole="button"
            style={styles.toggle}
          >
            <Text variant="caption" tone="primary">
              {showNameOnly ? 'Hide' : "Someone doesn't have an account?"}
            </Text>
          </Pressable>

          {showNameOnly ? (
            <View style={styles.nameOnly}>
              <Text variant="caption" tone="faint">
                Add them as a name only. They can claim this person later by joining with the
                invite link, rather than appearing twice.
              </Text>
              <View style={styles.addRow}>
                <Input
                  value={name}
                  onChangeText={setName}
                  placeholder="Name"
                  containerStyle={styles.addInput}
                  onSubmitEditing={add}
                  returnKeyType="done"
                  autoCapitalize="words"
                />
                <Button
                  label="Add"
                  variant="secondary"
                  onPress={add}
                  disabled={!name.trim()}
                  loading={addMember.isPending}
                />
              </View>
            </View>
          ) : null}
        </Card>

        <Card padding="lg" style={styles.block}>
          <Text variant="heading">Invite link</Text>
          <Text variant="caption" tone="muted">
            Anyone with this link can join the trip and see its expenses.
          </Text>

          <Pressable onPress={shareInvite} style={styles.codeBox}>
            <Text variant="body" weight="600" style={styles.code}>
              {trip.data?.invite_code ?? '········'}
            </Text>
          </Pressable>

          <Button
            label={copied ? 'Copied' : Platform.OS === 'web' ? 'Copy invite link' : 'Share invite link'}
            variant="secondary"
            onPress={shareInvite}
            fullWidth
          />
        </Card>

        <View style={styles.list}>
          <Text variant="label" tone="faint" style={styles.listHeading}>
            IN THIS TRIP ({members.data?.length ?? 0})
          </Text>

          {(members.data ?? []).map((member) => {
            const isMe = member.user_id != null && member.user_id === session?.user.id;

            return (
              <Card key={member.id} padding="sm">
                <View style={styles.memberRow}>
                  <Avatar name={member.display_name} size={38} />

                  <View style={styles.memberText}>
                    <Text variant="body" weight="600">
                      {member.display_name}
                      {isMe ? ' (you)' : ''}
                    </Text>
                    <Text variant="caption" tone="muted">
                      {member.role === 'owner' ? 'Owner' : 'Member'}
                      {member.user_id ? '' : ' · no account yet'}
                    </Text>
                  </View>

                  {isOwner && !isMe ? (
                    <Button
                      label="Remove"
                      variant="ghost"
                      size="sm"
                      onPress={() => setRemoving(member)}
                    />
                  ) : null}
                </View>
              </Card>
            );
          })}

          {isOwner ? null : (
            <Text variant="caption" tone="faint">
              Only the trip owner can remove people.
            </Text>
          )}

          <Text variant="caption" tone="faint">
            Removing someone hides them from new splits. Their existing expenses and balances stay
            exactly as they were.
          </Text>
        </View>
      </Screen>

      <ConfirmDialog
        visible={Boolean(removing)}
        onCancel={() => setRemoving(null)}
        onConfirm={confirmRemove}
        title={`Remove ${removing?.display_name ?? 'this person'}?`}
        message={`They'll be hidden from new splits. Every expense and balance they're already part of stays exactly as it is, so the trip's history doesn't change.`}
        confirmLabel="Remove"
        destructive
        loading={removeMember.isPending}
      />
    </>
  );
}

const styles = StyleSheet.create({
  block: { gap: spacing.sm },
  addRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, marginTop: spacing.xs },
  toggle: { alignSelf: 'flex-start', paddingVertical: spacing.xs },
  nameOnly: { gap: spacing.sm, marginTop: spacing.xs },
  addInput: { flex: 1 },
  codeBox: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: spacing.sm,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  code: { letterSpacing: 4, fontSize: 20 },
  list: { gap: spacing.sm },
  listHeading: { marginTop: spacing.sm, letterSpacing: 0.6 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  memberText: { flex: 1, gap: 2 },
});
