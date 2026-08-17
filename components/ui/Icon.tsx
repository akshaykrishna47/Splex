import type { IconProps, IconWeight } from 'phosphor-react-native';
// Individual imports only — importing the barrel would pull in ~1,200 icons.
import { Airplane } from 'phosphor-react-native/src/icons/Airplane';
import { Archive } from 'phosphor-react-native/src/icons/Archive';
import { ArrowCounterClockwise } from 'phosphor-react-native/src/icons/ArrowCounterClockwise';
import { ArrowRight } from 'phosphor-react-native/src/icons/ArrowRight';
import { ArrowsLeftRight } from 'phosphor-react-native/src/icons/ArrowsLeftRight';
import { Bag } from 'phosphor-react-native/src/icons/Bag';
import { Bed } from 'phosphor-react-native/src/icons/Bed';
import { Bell } from 'phosphor-react-native/src/icons/Bell';
import { BellRinging } from 'phosphor-react-native/src/icons/BellRinging';
import { CalendarBlank } from 'phosphor-react-native/src/icons/CalendarBlank';
import { Car } from 'phosphor-react-native/src/icons/Car';
import { CaretDown } from 'phosphor-react-native/src/icons/CaretDown';
import { CaretLeft } from 'phosphor-react-native/src/icons/CaretLeft';
import { CaretRight } from 'phosphor-react-native/src/icons/CaretRight';
import { ChartPieSlice } from 'phosphor-react-native/src/icons/ChartPieSlice';
import { Check } from 'phosphor-react-native/src/icons/Check';
import { CheckCircle } from 'phosphor-react-native/src/icons/CheckCircle';
import { Clock } from 'phosphor-react-native/src/icons/Clock';
import { Coins } from 'phosphor-react-native/src/icons/Coins';
import { Confetti } from 'phosphor-react-native/src/icons/Confetti';
import { Copy } from 'phosphor-react-native/src/icons/Copy';
import { DotsThreeCircle } from 'phosphor-react-native/src/icons/DotsThreeCircle';
import { ForkKnife } from 'phosphor-react-native/src/icons/ForkKnife';
import { Gear } from 'phosphor-react-native/src/icons/Gear';
import { HandCoins } from 'phosphor-react-native/src/icons/HandCoins';
import { House } from 'phosphor-react-native/src/icons/House';
import { Info } from 'phosphor-react-native/src/icons/Info';
import { Link } from 'phosphor-react-native/src/icons/Link';
import { MagnifyingGlass } from 'phosphor-react-native/src/icons/MagnifyingGlass';
import { Moon } from 'phosphor-react-native/src/icons/Moon';
import { PencilSimple } from 'phosphor-react-native/src/icons/PencilSimple';
import { Plus } from 'phosphor-react-native/src/icons/Plus';
import { Receipt } from 'phosphor-react-native/src/icons/Receipt';
import { Scales } from 'phosphor-react-native/src/icons/Scales';
import { ShoppingCart } from 'phosphor-react-native/src/icons/ShoppingCart';
import { SignOut } from 'phosphor-react-native/src/icons/SignOut';
import { SlidersHorizontal } from 'phosphor-react-native/src/icons/SlidersHorizontal';
import { Sun } from 'phosphor-react-native/src/icons/Sun';
import { Suitcase } from 'phosphor-react-native/src/icons/Suitcase';
import { Ticket } from 'phosphor-react-native/src/icons/Ticket';
import { Trash } from 'phosphor-react-native/src/icons/Trash';
import { User } from 'phosphor-react-native/src/icons/User';
import { UserPlus } from 'phosphor-react-native/src/icons/UserPlus';
import { Users } from 'phosphor-react-native/src/icons/Users';
import { Warning } from 'phosphor-react-native/src/icons/Warning';
import { X } from 'phosphor-react-native/src/icons/X';
import { View } from 'react-native';
import { colors } from '@/lib/theme';

/**
 * The whole icon vocabulary, in one place.
 *
 * Phosphor only — if something is missing here, add it to this map rather than
 * importing from another set. Mixing icon families is immediately visible.
 */
const ICONS = {
  // Categories
  food: ForkKnife,
  transport: Car,
  lodging: Bed,
  activities: Ticket,
  groceries: ShoppingCart,
  shopping: Bag,
  flights: Airplane,
  tickets: Ticket,
  other: DotsThreeCircle,

  // Navigation
  home: House,
  trips: Suitcase,
  balances: Scales,
  about: Info,
  profile: User,
  settings: Gear,
  notifications: Bell,
  'notifications-active': BellRinging,
  friends: Users,

  // Actions
  add: Plus,
  edit: PencilSimple,
  delete: Trash,
  settle: HandCoins,
  invite: UserPlus,
  duplicate: Copy,
  archive: Archive,
  restore: ArrowCounterClockwise,
  search: MagnifyingGlass,
  filter: SlidersHorizontal,
  link: Link,
  'sign-out': SignOut,
  sun: Sun,
  moon: Moon,

  // Indicators
  check: Check,
  'check-circle': CheckCircle,
  close: X,
  warning: Warning,
  info: Info,
  clock: Clock,
  calendar: CalendarBlank,
  chart: ChartPieSlice,
  money: Coins,
  receipt: Receipt,
  celebrate: Confetti,
  transfer: ArrowsLeftRight,
  'arrow-right': ArrowRight,
  'caret-down': CaretDown,
  'caret-left': CaretLeft,
  'caret-right': CaretRight,
} as const;

export type IconName = keyof typeof ICONS;

/** Standard sizes only — no arbitrary values. */
export type IconSize = 16 | 20 | 24 | 32;

export type AppIconProps = {
  name: IconName;
  size?: IconSize;
  /**
   * `regular` for default/inactive, `fill` for active or selected.
   * `duotone` is reserved for the About page's step illustrations.
   */
  weight?: Extract<IconWeight, 'regular' | 'fill' | 'duotone'>;
  /**
   * Defaults to the current text colour. Pass a theme token, never a literal
   * hex, so icons stay in step with the palette.
   */
  color?: string;
  /**
   * Decorative by default: the icon is hidden from assistive tech and the label
   * lives on the surrounding button. Pass a label only when the icon is the
   * sole carrier of meaning.
   */
  label?: string;
  style?: IconProps['style'];
};

export function Icon({
  name,
  size = 20,
  weight = 'regular',
  color = colors.text,
  label,
  style,
}: AppIconProps) {
  const Glyph = ICONS[name];

  // Phosphor's props don't include accessibility, and the SVG is the wrong
  // place for it anyway. A wrapper carries it: decorative icons are hidden from
  // assistive tech entirely, and an icon that IS the meaning gets a label.
  return (
    <View
      accessibilityElementsHidden={!label}
      importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}
      accessibilityLabel={label}
      accessibilityRole={label ? 'image' : 'none'}
      style={style as never}
    >
      <Glyph size={size} weight={weight} color={color} />
    </View>
  );
}

/** Category key -> icon name. Categories are a fixed enum, so this is total. */
export const CATEGORY_ICONS: Record<string, IconName> = {
  food: 'food',
  transport: 'transport',
  lodging: 'lodging',
  activities: 'activities',
  groceries: 'groceries',
  shopping: 'shopping',
  flights: 'flights',
  tickets: 'tickets',
  other: 'other',
};
