import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Input } from './Input';
import { Icon } from './Icon';
import { Sheet } from './Sheet';
import { Text } from './Text';
import { colors, radius, spacing } from '@/lib/theme';

export type SelectOption = {
  value: string;
  label: string;
  /** Secondary line under the label. */
  hint?: string;
  /** Emoji or small element shown before the label. */
  icon?: React.ReactNode;
  disabled?: boolean;
};

type SharedProps = {
  label?: string;
  options: SelectOption[];
  placeholder?: string;
  error?: string | null;
  helper?: string;
  /** Show a search box in the sheet. Auto-enables past 8 options. */
  searchable?: boolean;
  disabled?: boolean;
  /** Sheet heading. Defaults to `label`. */
  title?: string;
};

/**
 * Single-choice dropdown.
 *
 * Used anywhere the valid answers are already known — who paid, category — so
 * nobody can typo a name into existence or pick someone outside the trip.
 * Built on the existing Sheet so it behaves identically to the currency picker
 * rather than introducing a second dropdown idiom.
 */
export function Select({
  value,
  onChange,
  label,
  options,
  placeholder = 'Select…',
  error,
  helper,
  searchable,
  disabled,
  title,
}: SharedProps & { value: string | null; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value) ?? null;

  return (
    <View style={styles.container}>
      {label ? <FieldLabel>{label}</FieldLabel> : null}

      <Trigger
        open={() => setOpen(true)}
        disabled={disabled}
        error={Boolean(error)}
        placeholder={placeholder}
        icon={selected?.icon}
        text={selected?.label ?? null}
      />

      <Helper error={error} helper={helper} />

      <OptionSheet
        visible={open}
        onClose={() => setOpen(false)}
        title={title ?? label ?? 'Select'}
        options={options}
        searchable={searchable}
        isSelected={(o) => o.value === value}
        onPick={(o) => {
          onChange(o.value);
          setOpen(false);
        }}
      />
    </View>
  );
}

/**
 * Multi-choice dropdown with checkboxes, plus select-all / clear.
 *
 * The trigger summarises rather than listing every name, so a ten-person trip
 * doesn't blow the layout apart.
 */
export function MultiSelect({
  values,
  onChange,
  label,
  options,
  placeholder = 'Select…',
  error,
  helper,
  searchable,
  disabled,
  title,
  /** Word used in the summary, e.g. "3 people". */
  noun = 'selected',
}: SharedProps & {
  values: string[];
  onChange: (values: string[]) => void;
  noun?: string;
}) {
  const [open, setOpen] = useState(false);
  const selectable = options.filter((o) => !o.disabled);
  const allSelected = selectable.length > 0 && selectable.every((o) => values.includes(o.value));

  const summary = useMemo(() => {
    if (values.length === 0) return null;
    if (allSelected) return `Everyone (${values.length})`;
    if (values.length <= 2) {
      return options
        .filter((o) => values.includes(o.value))
        .map((o) => o.label)
        .join(', ');
    }
    return `${values.length} ${noun}`;
  }, [values, options, allSelected, noun]);

  function toggle(value: string) {
    onChange(values.includes(value) ? values.filter((v) => v !== value) : [...values, value]);
  }

  return (
    <View style={styles.container}>
      {label ? <FieldLabel>{label}</FieldLabel> : null}

      <Trigger
        open={() => setOpen(true)}
        disabled={disabled}
        error={Boolean(error)}
        placeholder={placeholder}
        text={summary}
      />

      <Helper error={error} helper={helper} />

      <OptionSheet
        visible={open}
        onClose={() => setOpen(false)}
        title={title ?? label ?? 'Select'}
        options={options}
        searchable={searchable}
        multiple
        isSelected={(o) => values.includes(o.value)}
        onPick={(o) => toggle(o.value)}
        onToggleAll={() =>
          onChange(allSelected ? [] : selectable.map((o) => o.value))
        }
        allSelected={allSelected}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text variant="caption" tone="muted" weight="600" style={styles.label}>
      {String(children).toUpperCase()}
    </Text>
  );
}

function Helper({ error, helper }: { error?: string | null; helper?: string }) {
  if (error) {
    return (
      <Text variant="caption" tone="negative" style={styles.helper}>
        {error}
      </Text>
    );
  }
  if (helper) {
    return (
      <Text variant="caption" tone="faint" style={styles.helper}>
        {helper}
      </Text>
    );
  }
  return null;
}

/** Styled to match Input's field exactly, so a form reads as one system. */
function Trigger({
  open,
  disabled,
  error,
  placeholder,
  text,
  icon,
}: {
  open: () => void;
  disabled?: boolean;
  error?: boolean;
  placeholder: string;
  text: string | null;
  icon?: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <Pressable
      onPress={disabled ? undefined : open}
      accessibilityRole="button"
      accessibilityState={{ disabled, expanded: false }}
      accessibilityLabel={text ?? placeholder}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[
        styles.trigger,
        hovered && !disabled && styles.triggerHovered,
        error && styles.triggerError,
        disabled && styles.triggerDisabled,
      ]}
    >
      {icon ? <View style={styles.triggerIcon}>{icon}</View> : null}
      <Text
        variant="body"
        tone={text ? 'default' : 'faint'}
        numberOfLines={1}
        style={styles.triggerText}
      >
        {text ?? placeholder}
      </Text>
      <Icon name="caret-down" size={16} color={colors.textMuted} />
    </Pressable>
  );
}

function OptionSheet({
  visible,
  onClose,
  title,
  options,
  searchable,
  multiple,
  isSelected,
  onPick,
  onToggleAll,
  allSelected,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  options: SelectOption[];
  searchable?: boolean;
  multiple?: boolean;
  isSelected: (option: SelectOption) => boolean;
  onPick: (option: SelectOption) => void;
  onToggleAll?: () => void;
  allSelected?: boolean;
}) {
  const [query, setQuery] = useState('');
  const showSearch = searchable ?? options.length > 8;

  const visibleOptions = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(term) || o.hint?.toLowerCase().includes(term),
    );
  }, [options, query]);

  return (
    <Sheet
      visible={visible}
      onClose={() => {
        setQuery('');
        onClose();
      }}
      title={title}
      header={
        showSearch ? (
          <Input value={query} onChangeText={setQuery} placeholder="Search" autoCorrect={false} />
        ) : undefined
      }
    >
      {multiple && onToggleAll ? (
        <Pressable onPress={onToggleAll} accessibilityRole="button" style={styles.toggleAll}>
          <Text variant="label" tone="primary">
            {allSelected ? 'Clear all' : 'Select everyone'}
          </Text>
        </Pressable>
      ) : null}

      {visibleOptions.map((option) => {
        const selected = isSelected(option);
        return (
          <Pressable
            key={option.value}
            onPress={() => {
              if (option.disabled) return;
              onPick(option);
              if (!multiple) setQuery('');
            }}
            accessibilityRole={multiple ? 'checkbox' : 'radio'}
            accessibilityState={{ checked: selected, disabled: option.disabled }}
            style={({ pressed }) => [
              styles.option,
              selected && styles.optionSelected,
              pressed && styles.optionPressed,
              option.disabled && styles.optionDisabled,
            ]}
          >
            {multiple ? (
              <View style={[styles.checkbox, selected && styles.checkboxOn]}>
                {selected ? (
                  <Icon name="check" size={16} color={colors.textInverse} />
                ) : null}
              </View>
            ) : null}

            {option.icon ? <View style={styles.optionIcon}>{option.icon}</View> : null}

            <View style={styles.optionText}>
              <Text variant="body" weight={selected ? '600' : '400'} numberOfLines={1}>
                {option.label}
              </Text>
              {option.hint ? (
                <Text variant="caption" tone="faint" numberOfLines={1}>
                  {option.hint}
                </Text>
              ) : null}
            </View>

            {!multiple && selected ? (
              <Icon name="check" size={16} color={colors.primaryText} />
            ) : null}
          </Pressable>
        );
      })}

      {visibleOptions.length === 0 ? (
        <Text variant="caption" tone="muted" style={styles.empty}>
          Nothing matches “{query}”.
        </Text>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  label: { marginBottom: 2, letterSpacing: 0.8 },
  helper: { marginTop: 2 },

  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
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
  triggerDisabled: { opacity: 0.5 },
  triggerIcon: { minWidth: 20, alignItems: 'center' },
  triggerText: { flex: 1 },

  toggleAll: { paddingVertical: spacing.md, alignItems: 'flex-start' },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  optionSelected: { backgroundColor: colors.primaryMuted },
  optionPressed: { backgroundColor: colors.surfaceMuted },
  optionDisabled: { opacity: 0.4 },
  optionIcon: { minWidth: 24, alignItems: 'center' },
  optionText: { flex: 1, gap: 1 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  empty: { paddingVertical: spacing.lg },
});
