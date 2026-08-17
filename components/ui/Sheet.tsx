import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Text } from './Text';
import { colors, radius, spacing } from '@/lib/theme';

export type SheetProps = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  /** Fixed row pinned under the title — e.g. a search field. */
  header?: React.ReactNode;
  /** Fixed row pinned to the bottom — e.g. confirm/cancel. */
  footer?: React.ReactNode;
  children: React.ReactNode;
};

/**
 * Bottom sheet on narrow viewports, centred dialog on wide ones. Content
 * scrolls; header and footer stay put.
 */
export function Sheet({ visible, onClose, title, header, footer, children }: SheetProps) {
  const { width, height } = useWindowDimensions();
  const isWide = width >= 720;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.backdrop, isWide && styles.backdropWide]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />

        <View
          style={[
            styles.panel,
            isWide ? styles.panelWide : styles.panelNarrow,
            { maxHeight: height * 0.85 },
          ]}
        >
          {!isWide ? <View style={styles.grabber} /> : null}

          {title ? (
            <View style={styles.titleRow}>
              <Text variant="heading">{title}</Text>
              <Pressable onPress={onClose} accessibilityRole="button" hitSlop={8}>
                <Text variant="label" tone="primary" numeric={false}>
                  Close
                </Text>
              </Pressable>
            </View>
          ) : null}

          {header ? <View style={styles.header}>{header}</View> : null}

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>

          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  backdropWide: { justifyContent: 'center', alignItems: 'center' },
  // A step above the page background so the sheet reads as lifted without a
  // shadow, and a hairline to hold its edge against the dimmed backdrop.
  panel: {
    backgroundColor: colors.surface,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  panelNarrow: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderBottomWidth: 0,
    paddingTop: spacing.sm,
  },
  panelWide: {
    borderRadius: radius.xl,
    width: 520,
    maxWidth: '92%',
    paddingTop: spacing.md,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.borderStrong,
    marginBottom: spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  scroll: { flexGrow: 0 },
  scrollContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
});
