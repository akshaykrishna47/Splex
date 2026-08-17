import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { friendlyError } from '@/lib/errors';
import { colors, radius, spacing } from '@/lib/theme';

type ToastTone = 'success' | 'error' | 'info';

type Toast = { id: number; tone: ToastTone; message: string };

type ToastApi = {
  success: (message: string) => void;
  error: (error: unknown, fallback?: string) => void;
  info: (message: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const DURATION = 4000;

/**
 * Lightweight toasts. Mounted once, near the root.
 *
 * `error()` takes the raw thrown value and runs it through `friendlyError`, so
 * no caller has to remember to sanitise a Postgres message before showing it.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((tone: ToastTone, message: string) => {
    setToasts((prev) => [...prev, { id: Date.now() + Math.random(), tone, message }]);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => push('success', message),
      info: (message) => push('info', message),
      error: (error, fallback) => push('error', friendlyError(error, fallback)),
    }),
    [push],
  );

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <View style={styles.host} pointerEvents="box-none">
        {toasts.map((toast) => (
          <ToastRow key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
        ))}
      </View>
    </ToastContext.Provider>
  );
}

function ToastRow({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  useEffect(() => {
    // Errors stay longer: they usually need reading, not just noticing.
    const timer = setTimeout(onDismiss, toast.tone === 'error' ? DURATION * 1.75 : DURATION);
    return () => clearTimeout(timer);
  }, [onDismiss, toast.tone]);

  const accent = toneColor[toast.tone];

  return (
    <Pressable
      onPress={onDismiss}
      accessibilityRole="alert"
      accessibilityLabel={toast.message}
      style={[styles.toast, { borderColor: toneBorder[toast.tone] }]}
    >
      <Icon name={toneIcon[toast.tone]} size={20} color={accent} />
      <Text variant="body" style={styles.message}>
        {toast.message}
      </Text>
      <Icon name="close" size={16} color={colors.textFaint} />
    </Pressable>
  );
}

const toneBorder: Record<ToastTone, string> = {
  success: colors.positiveBorder,
  error: colors.negativeBorder,
  info: colors.primaryBorder,
};

const toneColor: Record<ToastTone, string> = {
  success: colors.positive,
  error: colors.negative,
  info: colors.primaryText,
};

const toneIcon: Record<ToastTone, IconName> = {
  success: 'check-circle',
  error: 'warning',
  info: 'info',
};

/** Throws if used outside the provider — a silent no-op would hide bugs. */
export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.lg,
    gap: spacing.sm,
    alignItems: 'center',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    width: '100%',
    maxWidth: 460,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    backgroundColor: colors.surfaceRaised,
  },
  icon: { fontSize: 14, color: colors.text },
  message: { flex: 1 },
});
