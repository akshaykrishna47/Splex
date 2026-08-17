/**
 * Sparkle particles on a pressable.
 *
 * Adapted from CodeFronts' "CSS Text Sparkle Particle Highlight Hover" (MIT):
 *
 *   https://codefronts.com/motion/css-text-animations/css-text-sparkle-particle-highlight-hover/
 *
 * Only the badge half of that demo is used — four clip-path stars scattered
 * around the control, plus the glow ring. The shimmer display word is not part
 * of this.
 *
 * Two triggers. By default the stars pop in on hover, exactly as the badge
 * does. A control marked idle instead shows them permanently on a slow
 * twinkle, with hover shortening the cycle — that borrows the demo's other
 * half, where the twinkle runs continuously and hovering speeds the sweep.
 * Idle is for a hero call to action; the floating action button is on every
 * screen and would be a permanent distraction.
 *
 * Three properties of the original have no React Native equivalent and so live
 * here as real CSS: the eight-point star is a `clip-path` polygon, the stars are
 * filled with a `linear-gradient`, and the emphasis is driven by `:hover` and
 * `:focus-visible`, which RN has no notion of. Positioning, sizing and the
 * resting `scale(0)` live in `components/ui/Sparkles.tsx`, so on native the
 * particles are simply four invisible, zero-scaled views.
 *
 * Two deliberate departures from the source:
 *
 *   - Its palette (oklch violet and cyan) is dropped. Colours come from the
 *     existing tokens instead, so the effect follows the theme rather than
 *     introducing a third accent: white-to-accent stars, and a glow built from
 *     the primary border tint.
 *   - Its gradient badge fill and leading glyph are not adopted. The FAB's flat
 *     `primary` fill is deliberate — a gradient version of that button was
 *     built and then reverted — and a decorative star glyph would sit oddly in
 *     front of "Add expense".
 */

const STYLE_ID = 'splex-sparkle-fx';

/**
 * The leading `:root` lifts specificity above the single class
 * react-native-web compiles each style into, so the hover glow can replace the
 * shadow RNW generates from a component's `shadow*` props.
 *
 * The hover rule uses animation LONGHANDS rather than the shorthand. The
 * shorthand would reset `animation-delay` to zero, and the delay is what
 * staggers the four stars — it is set per index below, at lower specificity.
 */
const STYLESHEET = `
:root [data-splex-sparkle] {
  transition: box-shadow 350ms ease;
}

/* Two glows, because a box-shadow declaration replaces rather than adds to what
   is already there. A floating button owns a drop shadow that has to be
   restated or it would vanish on hover; a button sitting flat on a card has
   none, and giving it one would lift it off the surface it belongs to. */
:root [data-splex-sparkle="lift"]:hover,
:root [data-splex-sparkle="lift"]:focus-visible {
  box-shadow:
    0 6px 16px rgba(0, 0, 0, 0.4),
    0 0 16px -8px var(--splex-primary-border),
    0 0 30px -22px var(--splex-accent);
}

:root [data-splex-sparkle="flat"]:hover,
:root [data-splex-sparkle="flat"]:focus-visible {
  box-shadow:
    0 0 16px -8px var(--splex-primary-border),
    0 0 30px -22px var(--splex-accent);
}

:root [data-splex-spark] {
  background: linear-gradient(140deg, var(--splex-text-inverse), var(--splex-accent));
  clip-path: polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%);
}

/* ---- Default: nothing until you point at it, then the stars pop in turn. -- */

:root [data-splex-spark="1"] { animation-delay: 90ms; }
:root [data-splex-spark="2"] { animation-delay: 180ms; }
:root [data-splex-spark="3"] { animation-delay: 270ms; }

:root [data-splex-sparkle]:hover [data-splex-spark],
:root [data-splex-sparkle]:focus-visible [data-splex-spark] {
  animation-name: splex-spark-pop;
  animation-duration: 750ms;
  animation-timing-function: cubic-bezier(0.2, 0.9, 0.3, 1.4);
  animation-fill-mode: both;
}

/* ---- Opt-in: always on, for a hero call to action. ------------------------ */

/* A separate attribute rather than another value of the first, because the two
   are independent: whether a control carries its own shadow has nothing to do
   with whether its stars wait for a pointer. */
:root [data-splex-sparkle-idle] [data-splex-spark] {
  animation-name: splex-spark-twinkle;
  animation-duration: 2600ms;
  animation-timing-function: ease-in-out;
  animation-iteration-count: infinite;
  animation-fill-mode: none;
}

/* Negative delays, so each star starts partway through its cycle on the first
   frame. With positive ones all four would begin together and only drift apart
   later, which reads as a pulse rather than a twinkle. */
:root [data-splex-sparkle-idle] [data-splex-spark="1"] { animation-delay: -650ms; }
:root [data-splex-sparkle-idle] [data-splex-spark="2"] { animation-delay: -1300ms; }
:root [data-splex-sparkle-idle] [data-splex-spark="3"] { animation-delay: -1950ms; }

/* Ties with the generic hover rule above on specificity and wins by coming
   later, so an idle control speeds its twinkle instead of restarting a pop. */
:root [data-splex-sparkle-idle]:hover [data-splex-spark],
:root [data-splex-sparkle-idle]:focus-visible [data-splex-spark] {
  animation-name: splex-spark-twinkle;
  animation-duration: 900ms;
  animation-timing-function: ease-in-out;
  animation-iteration-count: infinite;
  animation-fill-mode: none;
}

@keyframes splex-spark-pop {
  0%   { transform: scale(0)    rotate(0deg); }
  60%  { transform: scale(1.25) rotate(40deg); }
  100% { transform: scale(1)    rotate(45deg); }
}

@keyframes splex-spark-twinkle {
  0%, 100% { opacity: 0.4; transform: scale(0.78) rotate(45deg); }
  50%      { opacity: 1;   transform: scale(1)    rotate(45deg); }
}

/* Every animated selector is repeated here, including the idle hover pair —
   that one is (0,4,0) outside this block and would otherwise outrank a
   shorter selector inside it. */
@media (prefers-reduced-motion: reduce) {
  :root [data-splex-sparkle] { transition: none; }
  :root [data-splex-sparkle]:hover [data-splex-spark],
  :root [data-splex-sparkle]:focus-visible [data-splex-spark],
  :root [data-splex-sparkle-idle] [data-splex-spark],
  :root [data-splex-sparkle-idle]:hover [data-splex-spark],
  :root [data-splex-sparkle-idle]:focus-visible [data-splex-spark] {
    animation: none;
    opacity: 0.85;
    transform: scale(1) rotate(45deg);
  }
}
`;

/** Injected once, web only. No-op on native. */
export function installSparkleFx(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLESHEET;
  document.head.appendChild(style);
}
