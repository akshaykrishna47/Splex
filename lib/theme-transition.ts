/**
 * The circular theme reveal, adapted from Magic UI's AnimatedThemeToggler.
 *
 *   https://magicui.design/docs/components/animated-theme-toggler
 *   registry/magicui/animated-theme-toggler.tsx — MIT, by Nazam Kalsi
 *
 * The View Transitions API snapshots the page before and after the palette
 * changes, then reveals the new snapshot through a circle growing out of the
 * toggle button. Chromium only; callers fall back to the colour sweep in
 * `lib/stores/theme.ts` everywhere else.
 *
 * Two things carried over verbatim from upstream because they are not obvious
 * and both fix real bugs:
 *
 *   - Coordinates are PERCENTAGES of the snapshot reference box, not pixels.
 *     Chrome renders absolute px clip-path coordinates on the pseudo-element
 *     unscaled on fractional display scales (Windows at 150%, which is exactly
 *     this machine) for the first transition after load, putting the circle in
 *     the wrong place. Upstream issue #989.
 *   - The viewport is measured with innerWidth/innerHeight rather than
 *     visualViewport, because the reference box those percentages resolve
 *     against includes classic scrollbars.
 *
 * Only the default `circle` variant is implemented. Upstream also ships square,
 * triangle, diamond, hexagon, rectangle and star; each is a self-contained
 * polygon function, so adding one later is additive.
 */

const STYLE_ID = 'splex-theme-vt';

/** Upstream's default. */
export const VT_DURATION = 400;

export type TransitionOrigin = { x: number; y: number };

/**
 * Required alongside the animation. `animation: none` on the two root
 * snapshots removes the browser's default cross-fade, so the clip-path reveal
 * is the only thing that moves.
 *
 * Both scoped rules key off an attribute that exists only while a theme toggle
 * is in flight, so no other view transition in the app is affected.
 */
const STYLESHEET = `
::view-transition-old(root),
::view-transition-new(root) {
  animation: none;
  mix-blend-mode: normal;
}

:root[data-splex-vt="active"]::view-transition-group(root) {
  animation-duration: var(--splex-vt-duration);
}

/* Without this the new snapshot paints unclipped for the frame between the
   snapshot being taken and the JS animation starting, which reads as a flash
   of the incoming theme. The Web Animations API sits above CSS in the cascade,
   so the animation still overrides this once it runs. */
:root[data-splex-vt="active"]::view-transition-new(root) {
  clip-path: var(--splex-vt-clip-from);
}
`;

function install(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLESHEET;
  document.head.appendChild(style);
}

/** The collapsed and fully-grown circles, as percentages of the reference box. */
function clipPaths(
  cx: number,
  cy: number,
  maxRadius: number,
  viewportWidth: number,
  viewportHeight: number,
): [string, string] {
  const point = (x: number, y: number) =>
    `${(x / viewportWidth) * 100}% ${(y / viewportHeight) * 100}%`;

  // A percentage radius resolves against hypot(w, h) / sqrt(2) of the box.
  const radius = (r: number) =>
    `${(r / (Math.hypot(viewportWidth, viewportHeight) / Math.SQRT2)) * 100}%`;

  return [`circle(0% at ${point(cx, cy)})`, `circle(${radius(maxRadius)} at ${point(cx, cy)})`];
}

type ViewTransitionCapable = Document & {
  startViewTransition?: (callback: () => void) => {
    ready: Promise<void>;
    finished: Promise<void>;
  };
};

/**
 * Runs `apply` inside a view transition and reveals the result through a
 * growing circle centred on `origin`.
 *
 * Returns false when the API is unavailable, so the caller can fall back
 * rather than silently skipping the theme change.
 */
export function runThemeTransition(
  apply: () => void,
  origin: TransitionOrigin | null,
  duration = VT_DURATION,
): boolean {
  if (typeof document === 'undefined' || typeof window === 'undefined') return false;

  const doc = document as ViewTransitionCapable;
  if (typeof doc.startViewTransition !== 'function') return false;

  const root = document.documentElement;

  // A second toggle mid-flight would snapshot a half-revealed page. Apply it
  // plainly instead of stacking transitions.
  if (root.dataset.splexVt === 'active') {
    apply();
    return true;
  }

  install();

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const x = origin ? origin.x : viewportWidth / 2;
  const y = origin ? origin.y : viewportHeight / 2;

  // Reach the furthest corner, so the circle always covers the whole viewport.
  const maxRadius = Math.hypot(
    Math.max(x, viewportWidth - x),
    Math.max(y, viewportHeight - y),
  );
  const clipPath = clipPaths(x, y, maxRadius, viewportWidth, viewportHeight);

  root.dataset.splexVt = 'active';
  root.style.setProperty('--splex-vt-duration', `${duration}ms`);
  root.style.setProperty('--splex-vt-clip-from', clipPath[0]);

  const cleanup = () => {
    delete root.dataset.splexVt;
    root.style.removeProperty('--splex-vt-duration');
    root.style.removeProperty('--splex-vt-clip-from');
  };

  const transition = doc.startViewTransition(apply);

  transition.finished.then(cleanup, cleanup);

  transition.ready
    .then(() => {
      root.animate(
        { clipPath },
        {
          duration,
          easing: 'ease-in-out',
          fill: 'forwards',
          pseudoElement: '::view-transition-new(root)',
        },
      );
    })
    .catch(() => {
      // A cancelled transition rejects `ready`; `finished` still cleans up.
    });

  return true;
}
