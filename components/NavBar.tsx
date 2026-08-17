import { useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { Logo } from './Logo';
import { ThemeToggle } from './ThemeToggle';
import { Avatar } from './ui/Avatar';
import { Sheet } from './ui/Sheet';
import { Text } from './ui/Text';
import { repo } from '@/lib/repo';
import { useProfile } from '@/lib/queries';
import { useSessionStore } from '@/lib/stores/session';
import { colors, radius, spacing } from '@/lib/theme';

type NavItem = {
  key: string;
  label: string;
  href: string;
  /** Routes that should also light this item up. */
  match?: (pathname: string) => boolean;
};

const ITEMS: NavItem[] = [
  { key: 'home', label: 'Home', href: '/', match: (p) => p === '/' },
  {
    key: 'trips',
    label: 'My Trips',
    href: '/trips',
    // A trip's own screens belong to "My Trips", not to Home.
    match: (p) => p.startsWith('/trips') || p.startsWith('/trip/'),
  },
  // No "Create Trip" here — the floating action button on Home and My Trips
  // owns that, and duplicating it in the nav just crowds the bar.
  { key: 'about', label: 'About', href: '/about', match: (p) => p.startsWith('/about') },
];

/**
 * Persistent top navigation.
 *
 * Three layouts rather than one squeezed layout:
 *   >= 720   every item inline
 *   520–719  the first two inline, the rest behind "More"
 *   < 520    logo plus a Menu button that opens the full list in a sheet
 *
 * The thresholds came down when "Create Trip" moved to the FAB: three short
 * items fit comfortably where four did not.
 *
 * Nothing is ever allowed to overflow or truncate — items move into the
 * dropdown instead of shrinking.
 */
export function NavBar() {
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  const router = useRouter();

  const session = useSessionStore((s) => s.session);
  const { data: profile } = useProfile(session?.user.id);

  const [menuOpen, setMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  // Signed-out screens (sign-in, invite links) render without app chrome.
  if (!session) return null;

  const isWide = width >= 720;
  const isCompact = width < 520;

  const inline = isWide ? ITEMS : isCompact ? [] : ITEMS.slice(0, 2);
  const overflow = ITEMS.filter((item) => !inline.includes(item));

  const name = profile?.display_name || session.user.email || 'You';

  function go(href: string) {
    setMenuOpen(false);
    setMoreOpen(false);
    router.push(href as never);
  }

  function isActive(item: NavItem) {
    return item.match ? item.match(pathname) : pathname === item.href;
  }

  return (
    <>
      <View style={styles.bar}>
        <Pressable
          onPress={() => go('/')}
          accessibilityRole="button"
          accessibilityLabel="Splex home"
          style={styles.brand}
        >
          <Logo size={26} />
          {!isCompact ? (
            <Text variant="heading" numeric={false} style={styles.brandText}>
              Splex
            </Text>
          ) : null}
        </Pressable>

        <View style={styles.items}>
          {inline.map((item) => (
            <NavLink key={item.key} label={item.label} active={isActive(item)} onPress={() => go(item.href)} />
          ))}

          {overflow.length > 0 && !isCompact ? (
            <NavLink
              label="More ▾"
              active={overflow.some(isActive)}
              onPress={() => setMoreOpen(true)}
            />
          ) : null}

          {isCompact ? <NavLink label="Menu" active={false} onPress={() => setMenuOpen(true)} /> : null}

          <ThemeToggle size={36} />

          <Pressable
            onPress={() => setAccountOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Account"
            style={styles.account}
          >
            <Avatar name={name} url={profile?.avatar_url} size={30} />
          </Pressable>
        </View>
      </View>

      {/* Compact: the whole navigation. Medium: just the overflow. */}
      <NavSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        title="Menu"
        items={ITEMS}
        isActive={isActive}
        onPick={go}
      />
      <NavSheet
        visible={moreOpen}
        onClose={() => setMoreOpen(false)}
        title="More"
        items={overflow}
        isActive={isActive}
        onPick={go}
      />

      <Sheet visible={accountOpen} onClose={() => setAccountOpen(false)} title="Account">
        <View style={styles.accountHeader}>
          <Avatar name={name} url={profile?.avatar_url} size={44} />
          <View style={styles.accountText}>
            <Text variant="body" weight="600" numberOfLines={1}>
              {name}
            </Text>
            {profile?.username ? (
              <Text variant="caption" tone="primary" weight="600" numberOfLines={1}>
                @{profile.username}
              </Text>
            ) : null}
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {session.user.email}
            </Text>
          </View>
        </View>

        <MenuRow
          label="Settings"
          hint="Profile and display currency"
          onPress={() => {
            setAccountOpen(false);
            router.push('/settings');
          }}
        />
        <MenuRow
          label="Sign out"
          tone="negative"
          onPress={async () => {
            setAccountOpen(false);
            await repo.auth.signOut();
            router.replace('/sign-in');
          }}
        />
      </Sheet>
    </>
  );
}

function NavLink({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityState={{ selected: active }}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[styles.link, active && styles.linkActive, hovered && !active && styles.linkHovered]}
    >
      {/* Colour comes from the nav palette, not `tone`: the page tones are
          measured against the page, and the bar is dark in both themes. */}
      <Text
        variant="label"
        numeric={false}
        numberOfLines={1}
        style={active ? styles.linkTextActive : styles.linkText}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function NavSheet({
  visible,
  onClose,
  title,
  items,
  isActive,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  items: NavItem[];
  isActive: (item: NavItem) => boolean;
  onPick: (href: string) => void;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      {items.map((item) => (
        <MenuRow
          key={item.key}
          label={item.label}
          active={isActive(item)}
          onPress={() => onPick(item.href)}
        />
      ))}
    </Sheet>
  );
}

function MenuRow({
  label,
  hint,
  active,
  tone = 'default',
  onPress,
}: {
  label: string;
  hint?: string;
  active?: boolean;
  tone?: 'default' | 'negative';
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        styles.menuRow,
        active && styles.menuRowActive,
        pressed && styles.menuRowPressed,
      ]}
    >
      <View style={styles.menuText}>
        <Text variant="body" weight={active ? '600' : '400'} tone={tone === 'negative' ? 'negative' : 'default'}>
          {label}
        </Text>
        {hint ? (
          <Text variant="caption" tone="faint">
            {hint}
          </Text>
        ) : null}
      </View>
      {active ? (
        <Text variant="label" tone="primary">
          ✓
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.navBg,
    borderBottomWidth: 1,
    borderBottomColor: colors.navBorder,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 0 },
  brandText: { color: colors.navText },
  items: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexShrink: 1 },

  link: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  linkText: { color: colors.navTextMuted },
  linkTextActive: { color: colors.navText },
  linkActive: { backgroundColor: colors.navFillStrong },
  linkHovered: { backgroundColor: colors.navFill },

  account: { marginLeft: spacing.xs },
  accountHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  accountText: { flex: 1, gap: 2 },

  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  menuRowActive: { backgroundColor: colors.primaryMuted },
  menuRowPressed: { backgroundColor: colors.surfaceMuted },
  menuText: { flex: 1, gap: 2 },
});
