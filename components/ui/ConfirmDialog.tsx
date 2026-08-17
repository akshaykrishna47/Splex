import { StyleSheet, View } from 'react-native';
import { Button } from './Button';
import { Sheet } from './Sheet';
import { Text } from './Text';
import { spacing } from '@/lib/theme';

export type ConfirmDialogProps = {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  /** Say what will actually happen, in plain language. */
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button, for anything that removes or hides data. */
  destructive?: boolean;
  loading?: boolean;
};

/**
 * Confirmation for actions that are hard to undo or move money.
 *
 * Built on Sheet, so it behaves like every other overlay in the app. Reserved
 * for consequential actions — confirming a harmless one just trains people to
 * click through without reading.
 */
export function ConfirmDialog({
  visible,
  onCancel,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  loading = false,
}: ConfirmDialogProps) {
  return (
    <Sheet
      visible={visible}
      onClose={onCancel}
      title={title}
      footer={
        <View style={styles.actions}>
          <Button label={cancelLabel} variant="secondary" onPress={onCancel} />
          <Button
            label={confirmLabel}
            variant={destructive ? 'danger' : 'primary'}
            onPress={onConfirm}
            loading={loading}
            style={styles.confirm}
          />
        </View>
      }
    >
      <Text variant="body" tone="muted" style={styles.message}>
        {message}
      </Text>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  message: { paddingVertical: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.sm },
  confirm: { flex: 1 },
});
