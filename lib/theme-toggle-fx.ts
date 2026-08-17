/**
 * The "Expand" theme-toggle animation, vendored.
 *
 * Adapted from theme-toggles by Alfie Jones, MIT licensed:
 *
 *   https://github.com/alfiejones/theme-toggles
 *   Copyright (c) 2022 Alfie Jones
 *   Animation values taken verbatim from @theme-toggles/react@4.1.0,
 *   css/Expand.css.
 *
 * Vendored rather than installed for three reasons: the library's component
 * renders its own `<button>`, which would nest inside our `Pressable` and break
 * the switch role; the whole thing is 1.3 KB of CSS and one SVG path set; and
 * the current npm release (5.0.0-rc.0) rewrote it around Tailwind `dark:`
 * variants keyed to a global selector this app does not use.
 *
 * Only the selectors changed. Upstream keys off a `theme-toggle--toggled`
 * class on the button; here the toggled state is read from the theme attribute
 * on the document root instead. That is deliberate: the circular reveal in
 * `lib/theme-transition.ts` snapshots the page inside a synchronous callback,
 * and driving the icon from React state would need `flushSync` (and a
 * `react-dom` import) to make the new state part of that snapshot. Reading the
 * same attribute the palette reads makes the icon change in the same write. Timings, easings and path data are
 * untouched.
 *
 * Web only. React Native has no CSS and cannot interpolate an SVG `d`, so
 * `ThemeToggle` keeps its Animated cross-fade there.
 */

const STYLE_ID = 'splex-toggle-fx';

/**
 * Structural selectors (`svg > clipPath > path`) rather than upstream's
 * `:first-child path`, so the rules do not depend on the order react-native-svg
 * happens to emit children in.
 *
 * The leading `:root` is not decoration. It lifts the base rules to (0,2,3) and
 * the toggled ones to (0,3,3), which clears both the single class
 * react-native-web compiles each style into and the global
 * `:root[data-theme-transition] *` rule in `lib/stores/theme.ts` at (0,2,0).
 * Without it, a theme change would retime this 500ms morph to the 360ms of the
 * page-wide colour sweep.
 */
const STYLESHEET = `
:root { --splex-toggle-duration: 500ms; }

/* Sun core and rays. Both scale, with the delay that lets the crescent lead. */
:root [data-splex-toggle] svg > g > circle,
:root [data-splex-toggle] svg > g > path {
  transform-origin: center;
  transition:
    transform calc(var(--splex-toggle-duration) * 0.65) cubic-bezier(0, 0, 0, 1.25)
      calc(var(--splex-toggle-duration) * 0.35),
    fill var(--splex-toggle-duration) linear;
  fill: var(--splex-nav-warm);
}

/* The crescent. Animating the path data is what turns the disc into a moon. */
:root [data-splex-toggle] svg > clipPath > path {
  transition-property: transform, d;
  transition-duration: calc(var(--splex-toggle-duration) * 0.6);
  transition-timing-function: cubic-bezier(0, 0, 0.5, 1);
}

:root:not([data-theme="light"]) [data-splex-toggle] svg > g > circle {
  transform: scale(1.4);
  transition-delay: 0s;
}

:root:not([data-theme="light"]) [data-splex-toggle] svg > g > path {
  transform: scale(0.75);
  transition-delay: 0s;
}

:root:not([data-theme="light"]) [data-splex-toggle] svg > g > circle,
:root:not([data-theme="light"]) [data-splex-toggle] svg > g > path {
  fill: var(--splex-nav-cool);
}

:root:not([data-theme="light"]) [data-splex-toggle] svg > clipPath > path {
  d: path("M-9 3h25a1 1 0 0017 13v30H0Z");
  transition-delay: calc(var(--splex-toggle-duration) * 0.4);
  transition-timing-function: cubic-bezier(0, 0, 0, 1.25);
}

/* Firefox before 97 and older Safari cannot interpolate path data. Sliding the
   same path to roughly where the morph would put it gets the crescent without
   needing interpolation. */
@supports not (d: path("")) {
  :root:not([data-theme="light"]) [data-splex-toggle] svg > clipPath > path {
    transform: translate3d(-9px, 14px, 0);
  }
}

@media (prefers-reduced-motion: reduce) {
  :root [data-splex-toggle] svg * {
    transition: none !important;
  }
}
`;

/** Injected once, web only. No-op on native. */
export function installToggleFx(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLESHEET;
  document.head.appendChild(style);
}

/** The sun's core radius and the eight rays, from @theme-toggles/react@4.1.0. */
export const SUN_CORE = { cx: 16, cy: 16, r: 8.4 } as const;

export const SUN_RAYS =
  'M18.3 3.2c0 1.3-1 2.3-2.3 2.3s-2.3-1-2.3-2.3S14.7.9 16 .9s2.3 1 2.3 2.3zm-4.6 25.6c0-1.3 1-2.3 2.3-2.3s2.3 1 2.3 2.3-1 2.3-2.3 2.3-2.3-1-2.3-2.3zm15.1-10.5c-1.3 0-2.3-1-2.3-2.3s1-2.3 2.3-2.3 2.3 1 2.3 2.3-1 2.3-2.3 2.3zM3.2 13.7c1.3 0 2.3 1 2.3 2.3s-1 2.3-2.3 2.3S.9 17.3.9 16s1-2.3 2.3-2.3zm5.8-7C9 7.9 7.9 9 6.7 9S4.4 8 4.4 6.7s1-2.3 2.3-2.3S9 5.4 9 6.7zm16.3 21c-1.3 0-2.3-1-2.3-2.3s1-2.3 2.3-2.3 2.3 1 2.3 2.3-1 2.3-2.3 2.3zm2.4-21c0 1.3-1 2.3-2.3 2.3S23 7.9 23 6.7s1-2.3 2.3-2.3 2.4 1 2.4 2.3zM6.7 23C8 23 9 24 9 25.3s-1 2.3-2.3 2.3-2.3-1-2.3-2.3 1-2.3 2.3-2.3z';

/** The untoggled crescent clip. The toggled shape lives in the stylesheet. */
export const CRESCENT_CLIP = 'M0-11h25a1 1 0 0017 13v30H0Z';
