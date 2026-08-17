import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button } from './Button';
import { Sheet } from './Sheet';
import { Text } from './Text';
import {
  addDays,
  addMonths,
  formatDateHeading,
  formatLongDate,
  formatMonthYear,
  monthGrid,
  todayIso,
} from '@/lib/dates';
import { colors, radius, spacing } from '@/lib/theme';

export type DateFieldProps = {
  /** ISO `YYYY-MM-DD`. */
  value: string;
  onChange: (iso: string) => void;
  label?: string;
  helper?: string;
  error?: string | null;
};

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/**
 * Date picker built on the existing Sheet.
 *
 * Replaces the old free-text `YYYY-MM-DD` field: the value is always a real
 * date, so it cannot be mistyped, and the display is readable ("Today",
 * "Yesterday", or "Mon 17 Aug 2026") rather than an ISO string.
 *
 * Past and future dates are both selectable — the app has no rule against
 * recording an expense ahead of time.
 */
export function DateField({ value, onChange, label, helper, error }: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(value || todayIso());
  const [hovered, setHovered] = useState(false);

  const today = todayIso();

  function pick(iso: string) {
    onChange(iso);
    setOpen(false);
  }

  return (
    <View style={styles.container}>
      {label ? (
        <Text variant="caption" tone="muted" weight="600" style={styles.label}>
          {label.toUpperCase()}
        </Text>
      ) : null}

      <Pressable
        onPress={() => {
          setMonth(value || today);
          setOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={`Date: ${formatLongDate(value)}`}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        style={[styles.trigger, hovered && styles.triggerHovered, error && styles.triggerError]}
      >
        <Text variant="body" style={styles.triggerText}>
          {formatDateHeading(value)}
        </Text>
        <Text variant="caption" tone="muted">
          {formatLongDate(value)} ▾
        </Text>
      </Pressable>

      {error ? (
        <Text variant="caption" tone="negative" style={styles.helper}>
          {error}
        </Text>
      ) : helper ? (
        <Text variant="caption" tone="faint" style={styles.helper}>
          {helper}
        </Text>
      ) : null}

      <Sheet
        visible={open}
        onClose={() => setOpen(false)}
        title="Pick a date"
        footer={
          <View style={styles.quickRow}>
            <Button label="Yesterday" variant="secondary" size="sm" onPress={() => pick(addDays(today, -1))} />
            <Button label="Today" size="sm" onPress={() => pick(today)} style={styles.quickGrow} />
          </View>
        }
      >
        <View style={styles.monthRow}>
          <Button label="‹" variant="secondary" size="sm" onPress={() => setMonth(addMonths(month, -1))} />
          <Text variant="heading" align="center" style={styles.monthLabel}>
            {formatMonthYear(month)}
          </Text>
          <Button label="›" variant="secondary" size="sm" onPress={() => setMonth(addMonths(month, 1))} />
        </View>

        <View style={styles.weekdays}>
          {WEEKDAYS.map((day, i) => (
            <Text key={`${day}-${i}`} variant="caption" tone="faint" align="center" style={styles.cell}>
              {day}
            </Text>
          ))}
        </View>

        <View style={styles.grid}>
          {monthGrid(month).map((iso, i) => {
            if (!iso) return <View key={`pad-${i}`} style={styles.cell} />;

            const isSelected = iso === value;
            const isToday = iso === today;
            const day = Number(iso.slice(8, 10));

            return (
              <Pressable
                key={iso}
                onPress={() => pick(iso)}
                accessibilityRole="button"
                accessibilityLabel={formatLongDate(iso)}
                accessibilityState={{ selected: isSelected }}
                style={({ pressed }) => [
                  styles.cell,
                  styles.day,
                  isToday && !isSelected && styles.dayToday,
                  isSelected && styles.daySelected,
                  pressed && styles.dayPressed,
                ]}
              >
                <Text
                  variant="body"
                  tone={isSelected ? 'inverse' : 'default'}
                  weight={isSelected || isToday ? '600' : '400'}
                >
                  {day}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  label: { marginBottom: 2, letterSpacing: 0.8 },
  helper: { marginTop: 2 },

  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 46,
  },
  triggerHovered: { borderColor: colors.borderStrong, backgroundColor: colors.surfaceRaised },
  triggerError: { borderColor: colors.negative },
  triggerText: { flexShrink: 0 },

  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  monthLabel: { flex: 1 },

  weekdays: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  // Seven columns. Percentage width keeps the grid square-ish at any sheet size.
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  day: { borderRadius: radius.pill },
  dayToday: { borderWidth: 1, borderColor: colors.borderStrong },
  daySelected: { backgroundColor: colors.primary },
  dayPressed: { backgroundColor: colors.surfaceRaised },

  quickRow: { flexDirection: 'row', gap: spacing.sm },
  quickGrow: { flex: 1 },
});
