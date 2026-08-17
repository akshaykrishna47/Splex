import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { runThemeTransition, type TransitionOrigin } from '@/lib/theme-transition';
import { PALETTE, cssVarName, type ColorToken, type ThemeName } from '@/lib/theme';

type ThemeState = {
  theme: ThemeName;
  toggle: () => void;
  setTheme: (theme: ThemeName) => void;
};

const STYLE_ID = 'splex-theme-vars';

/** How long the whole UI takes to cross into the new palette. */
const TRANSITION_MS = 360;
/** Present on <html> only while a theme change is in flight. */
const TRANSITION_ATTR = 'data-theme-transition';

/**
 * Emits both palettes as CSS custom properties.
 *
 * `:root` carries dark, which matches the fallback baked into every `var()` in
 * `colors`, so the app renders correctly even before this runs. The light theme
 * is an attribute override, so switching is one attribute write on <html> —
 * nothing re-renders and no component knows a theme exists.
 */
function themeCss(): string {
  const declarations = (theme: ThemeName) =>
    (Object.keys(PALETTE[theme]) as ColorToken[])
      .map((token) => `${cssVarName(token)}:${PALETTE[theme][token]};`)
      .join('');

  return [
    `:root{color-scheme:dark;${declarations('dark')}}`,
    `:root[data-theme="light"]{color-scheme:light;${declarations('light')}}`,
    // The page behind the app should match, or you get a flash of the wrong
    // colour when the app is shorter than the viewport.
    `html,body{background:var(${cssVarName('bg')});}`,
    TRANSITION_CSS,
  ].join('\n');
}

/**
 * Makes the palette change sweep across the UI instead of snapping.
 *
 * Custom properties themselves cannot be interpolated, but that is not what
 * happens here: when `--splex-bg` changes, the computed value of every
 * `background-color` reading it changes from one real colour to another, and
 * *those* transition normally. So one rule animates the entire interface.
 *
 * Three things it deliberately does not do:
 *
 *   - It is not always on. The attribute is added for the length of the change
 *     and then removed, so a rule this broad never taxes ordinary interaction,
 *     and hover states keep snapping the way they do today.
 *   - It lists properties rather than using `all`, which would animate layout
 *     and guarantee jank on a page this tall.
 *   - It leaves `opacity` alone. Several elements already own their opacity
 *     (the scroll effects, the toggle icon), and layering a second transition
 *     on top of those would fight them.
 */
const TRANSITION_CSS = `
:root[${TRANSITION_ATTR}] *,
:root[${TRANSITION_ATTR}] *::before,
:root[${TRANSITION_ATTR}] *::after {
  transition-property: background-color, border-color, color, fill, stroke, box-shadow, outline-color;
  transition-duration: ${TRANSITION_MS}ms;
  transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
}

/* A soft wash of the incoming accent, blooming out of the toggle. Purely
   additive — it sits above the page but takes no pointer events, and its
   colour is already a low-alpha token, so it reads as a pulse rather than a
   flash. */
:root[${TRANSITION_ATTR}]::after {
  content: '';
  position: fixed;
  inset: 0;
  z-index: 9999;
  pointer-events: none;
  background: radial-gradient(
    circle at var(--splex-wash-x, 100%) var(--splex-wash-y, 0%),
    var(${cssVarName('primaryMuted')}),
    transparent 55%
  );
  animation: splex-theme-wash ${TRANSITION_MS}ms cubic-bezier(0.4, 0, 0.2, 1);
}

@keyframes splex-theme-wash {
  0% { opacity: 0; }
  45% { opacity: 1; }
  100% { opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  :root[${TRANSITION_ATTR}] *,
  :root[${TRANSITION_ATTR}] *::before,
  :root[${TRANSITION_ATTR}] *::after {
    transition: none !important;
  }
  :root[${TRANSITION_ATTR}]::after { display: none; }
}
`;

/** Injected once, on the web only. No-op on native. */
export function installThemeVars(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = themeCss();
  document.head.appendChild(style);
}

let transitionTimer: ReturnType<typeof setTimeout> | undefined;
let origin: TransitionOrigin | null = null;

/**
 * Where the change appears to start from. Called with the toggle's centre, so
 * both the circular reveal and the fallback wash originate at the button the
 * user just pressed rather than arriving from nowhere.
 */
export function setThemeTransitionOrigin(x: number, y: number): void {
  if (typeof document === 'undefined') return;
  origin = { x, y };
  const style = document.documentElement.style;
  style.setProperty('--splex-wash-x', `${Math.round(x)}px`);
  style.setProperty('--splex-wash-y', `${Math.round(y)}px`);
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * `animate` is off by default on purpose. Rehydrating the persisted choice on
 * load also calls this, and animating there would show the app crossing from
 * the default dark palette into the stored light one every single launch.
 *
 * Three paths, in descending order of what the browser can do:
 *
 *   1. Chromium — the circular reveal from `lib/theme-transition.ts`.
 *   2. Everywhere else — the page-wide colour sweep below.
 *   3. Reduced motion — neither; the palette simply changes.
 *
 * One and two are mutually exclusive by nature, not by preference: a view
 * transition replaces the page with a still snapshot while it plays, so a
 * colour sweep underneath it would be invisible and would only cost paint.
 */
function applyTheme(theme: ThemeName, animate = false): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  // Dark is the default in `:root`, so it needs no attribute.
  const write = () => {
    if (theme === 'light') root.setAttribute('data-theme', 'light');
    else root.removeAttribute('data-theme');
  };

  if (!animate || prefersReducedMotion()) {
    write();
    return;
  }

  if (runThemeTransition(write, origin)) return;

  root.setAttribute(TRANSITION_ATTR, '');
  // Force a style flush so the transition is in effect BEFORE the custom
  // properties change. Setting both attributes in one frame is the classic
  // way to end up with no transition at all.
  void root.offsetHeight;

  clearTimeout(transitionTimer);
  transitionTimer = setTimeout(() => root.removeAttribute(TRANSITION_ATTR), TRANSITION_MS);

  write();
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      // Dark stays the default: the app has always looked this way, and
      // silently flipping appearance on upgrade would be a surprise.
      theme: 'dark',

      // Both are user-initiated, so both animate.
      setTheme: (theme) => {
        applyTheme(theme, true);
        set({ theme });
      },

      toggle: () => {
        const next: ThemeName = get().theme === 'dark' ? 'light' : 'dark';
        applyTheme(next, true);
        set({ theme: next });
      },
    }),
    {
      name: 'splex-theme',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      // The persisted choice arrives asynchronously, so apply it once it does.
      onRehydrateStorage: () => (state) => {
        if (state) applyTheme(state.theme);
      },
    },
  ),
);
