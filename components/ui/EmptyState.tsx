import { StyleSheet, View } from 'react-native';
import { Button } from './Button';
import { Card } from './Card';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { colors, radius, spacing } from '@/lib/theme';

export type EmptyStateProps = {
  icon: IconName;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Secondary, lower-emphasis action. */
  secondaryLabel?: string;
  onSecondary?: () => void;
};

/**
 * The "nothing here yet" state, used everywhere a list can be empty.
 *
 * A blank area reads as a broken screen. This says what belongs here and offers
 * the action that fills it, so an empty trip is an invitation rather than a
 * dead end.
 */
export function EmptyState({
  icon,
  title,
  message,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
}: EmptyStateProps) {
  return (
    <Card padding="lg" style={styles.card}>
      <View style={styles.badge}>
        <Icon name={icon} size={24} color={colors.textMuted} />
      </View>

      <Text variant="heading" align="center">
        {title}
      </Text>
      <Text variant="body" tone="muted" align="center" style={styles.message}>
        {message}
      </Text>

      {actionLabel && onAction ? (
        <View style={styles.actions}>
          <Button label={actionLabel} onPress={onAction} />
          {secondaryLabel && onSecondary ? (
            <Button label={secondaryLabel} variant="secondary" onPress={onSecondary} />
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl },
  badge: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
    marginBottom: spacing.xs,
  },
  emoji: { fontSize: 26 },
  message: { maxWidth: 360 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
});
