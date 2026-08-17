import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { FAB_CLEARANCE } from './ui/Fab';
import { Text } from './ui/Text';
import { colors, spacing } from '@/lib/theme';

export type ScreenProps = {
  /** Optional so `<Screen loading />` and `<Screen error={e} />` read cleanly. */
  children?: React.ReactNode;
  loading?: boolean;
  error?: unknown;
  onRefresh?: () => void;
  refreshing?: boolean;
  /** Sticks to the bottom of the viewport, outside the scroll area. */
  footer?: React.ReactNode;
  /**
   * A floating action button. Rendered INSIDE this component's root view on
   * purpose: the FAB is absolutely positioned, so it anchors to the nearest
   * positioned ancestor. Placed as a sibling of `<Screen>` it anchored to
   * whatever the navigator wrapped it in and drifted outside the visible frame.
   *
   * Passing it here also lets the scroll area reserve clearance automatically.
   */
  fab?: React.ReactNode;
};

/**
 * Standard screen chrome: centred max-width column on wide viewports, pull to
 * refresh, and one place that renders loading and error states so every screen
 * handles them the same way.
 */
export function Screen({
  children,
  loading,
  error,
  onRefresh,
  refreshing,
  footer,
  fab,
}: ScreenProps) {
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primaryText} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text variant="heading" align="center">
          Something went wrong
        </Text>
        <Text variant="caption" tone="muted" align="center" style={styles.errorDetail}>
          {messageFor(error)}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.content, Boolean(fab) && styles.contentWithFab]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} />
          ) : undefined
        }
      >
        <View style={styles.column}>{children}</View>
      </ScrollView>

      {footer ? (
        <View style={styles.footer}>
          <View style={styles.column}>{footer}</View>
        </View>
      ) : null}

      {fab}
    </View>
  );
}

export function messageFor(error: unknown): string {
  if (!error) return '';
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    padding: spacing.xl,
    gap: spacing.sm,
  },
  errorDetail: { maxWidth: 360 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, alignItems: 'center' },
  contentWithFab: { paddingBottom: FAB_CLEARANCE },
  column: { width: '100%', maxWidth: 640, gap: spacing.md },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    alignItems: 'center',
  },
});
