import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { Platform } from 'react-native';

/**
 * The pinned scroll effect used on the About page.
 *
 * Adapted from the CodeFronts "sticky scroll text opacity fade". Four of the
 * pieces it needs have no React Native equivalent and so have to be real CSS:
 * `position: sticky`, `@keyframes`, `filter: blur()`, and the scroll-driven
 * `view-timeline-name` / `animation-timeline` / `animation-range` trio.
 *
 * Everything else — colours, spacing, absolute stacking, the tall scroll
 * runways — stays in StyleSheet, so this file is deliberately small. Colours in
 * particular are already CSS custom properties on web (see `lib/theme.ts`), so
 * they need no help here and keep following the light/dark toggle.
 *
 * The decision of *whether* to run lives in `usePinnedScroll` rather than in
 * `@supports` / `@media` blocks. The layout heights and the animation have to
 * agree — a 2.4-viewport runway with no animation is just a wall of blank
 * space — and one JS branch keeps them from drifting apart.
 */

const STYLE_ID = 'splex-scroll-fx';

/**
 * Two things about these selectors are deliberate.
 *
 * They are two levels deep because react-native-web compiles every style into a
 * single class, so a one-attribute selector ties on specificity and would win
 * only by injection order. `[data-splex-fx="on"] [data-splex-…]` scores (0,2,0)
 * and beats it outright.
 *
 * They hang off `="on"` because the wrapper is the single switch: when the
 * effect is off the attribute reads `"off"`, nothing below matches, and the
 * page is plain markup again. Gating on `@supports`/`@media` instead would let
 * the CSS and the JS-computed runway heights disagree.
 */
const STYLESHEET = `
[data-splex-fx="on"] [data-splex-hero-pin],
[data-splex-fx="on"] [data-splex-chapters-pin],
[data-splex-fx="on"] [data-splex-gallery-pin] {
  position: sticky;
  top: 0;
}

[data-splex-fx="on"] [data-splex-hero-tall]     { view-timeline-name: --splex-hero; }
[data-splex-fx="on"] [data-splex-chapters-tall] { view-timeline-name: --splex-chapters; }
[data-splex-fx="on"] [data-splex-gallery-tall]  { view-timeline-name: --splex-gallery; }

/* The hero runway and the chapter runway are both taller than the scrollport,
   so the contain range measures exactly the stretch where the section covers
   the viewport -- which is exactly the stretch where it is pinned. The cover
   range would spend most of itself on the approach, before anything is stuck. */

[data-splex-fx="on"] [data-splex-hero-content] {
  animation: splex-hero-exit linear both;
  animation-timeline: --splex-hero;
  animation-range: contain 8% contain 82%;
  will-change: opacity, filter, transform;
}

[data-splex-fx="on"] [data-splex-hero-mark] {
  animation: splex-hero-drift linear both;
  animation-timeline: --splex-hero;
  animation-range: contain 0% contain 100%;
}

/* One keyframe, three slices of one timeline. The windows overlap by ~4% so
   each line is still fading out as the next fades in. */
[data-splex-fx="on"] [data-splex-chapter] {
  animation: splex-chapter linear both;
  animation-timeline: --splex-chapters;
  will-change: opacity, filter, transform;
}
/* The first line starts on the cover range, not the contain range, so it rides
   in with the section instead of appearing only once the pin locks — otherwise
   a full scrollport of approach passes with nothing on screen but the eyebrow. */
[data-splex-fx="on"] [data-splex-chapter="1"] { animation-range: cover 12% contain 36%; }
[data-splex-fx="on"] [data-splex-chapter="2"] { animation-range: contain 32% contain 68%; }
[data-splex-fx="on"] [data-splex-chapter="3"] { animation-range: contain 64% contain 100%; }

/* The features gallery: vertical scroll drives horizontal travel.

   How far it travels is a measured value (track width minus the visible
   window), which a static keyframe cannot contain. It arrives as a custom
   property instead — keyframe values are substituted per element, so updating
   the custom property on a resize re-targets the running animation with no
   restart. */
[data-splex-fx="on"] [data-splex-gallery-track] {
  animation: splex-gallery-pan linear both;
  animation-timeline: --splex-gallery;
  animation-range: contain 0% contain 100%;
  will-change: transform;
}

[data-splex-fx="on"] [data-splex-gallery-progress] {
  animation: splex-gallery-progress linear both;
  animation-timeline: --splex-gallery;
  animation-range: contain 0% contain 100%;
}

/* ---------------------------------------------------------------------------
   Stages: the hero's pinned-statement-then-rising-panel pattern, reused three
   more times.

   All three runways declare the SAME timeline name. A named timeline is
   referenceable by the declaring element and its descendants, so each stage's
   children resolve to their own ancestor's timeline and the three run
   independently — no need for three names and three copies of every rule.

   What differs per stage is only the animation name. Everything else — which
   timeline, which slice of it, easing, fill — is shared, so the stages stay in
   step with each other and with the hero.
--------------------------------------------------------------------------- */

[data-splex-fx="on"] [data-splex-stage]     { view-timeline-name: --splex-stage; }
[data-splex-fx="on"] [data-splex-stage-pin] { position: sticky; top: 0; }

[data-splex-fx="on"] [data-splex-stage] [data-splex-stage-eyebrow],
[data-splex-fx="on"] [data-splex-stage] [data-splex-stage-lead],
[data-splex-fx="on"] [data-splex-stage] [data-splex-stage-sub],
[data-splex-fx="on"] [data-splex-stage] [data-splex-stage-text],
[data-splex-fx="on"] [data-splex-stage] [data-splex-stage-art] {
  animation-timeline: --splex-stage;
  animation-range: contain 6% contain 80%;
  animation-timing-function: linear;
  animation-fill-mode: both;
  will-change: opacity, transform;
}

/* A — the two lines pull apart and the panel rises through the gap. */
[data-splex-fx="on"] [data-splex-stage="a"] [data-splex-stage-eyebrow] { animation-name: splex-dissolve; }
[data-splex-fx="on"] [data-splex-stage="a"] [data-splex-stage-lead]    { animation-name: splex-part-left; }
[data-splex-fx="on"] [data-splex-stage="a"] [data-splex-stage-sub]     { animation-name: splex-part-right; }
[data-splex-fx="on"] [data-splex-stage="a"] [data-splex-stage-art]     { animation-name: splex-scatter; }

/* B — nothing moves aside; the whole block recedes into the distance. */
[data-splex-fx="on"] [data-splex-stage="b"] [data-splex-stage-text] { animation-name: splex-recede; }
[data-splex-fx="on"] [data-splex-stage="b"] [data-splex-stage-art]  { animation-name: splex-rule-draw; }

/* C — recedes, the same way B does. Its art is the photo fan, which runs on
   its own timing above rather than on the shared stage range. */
[data-splex-fx="on"] [data-splex-stage="c"] [data-splex-stage-text] { animation-name: splex-recede; }

/* The photo fan on the closing stage. All three frames start stacked on the
   middle one and spread outward as the section arrives, so they read as being
   dealt from a single pile rather than sliding in from off-screen.

   Its range is its own: the shared stage range animates things AWAY as the
   panel rises, and this has to arrive instead. It opens during the approach
   and finishes just after the pin locks. Note there is no animation-duration
   anywhere in this file: its initial value is auto, which a scroll timeline
   resolves to the whole range, and naming a time would freeze every one of
   these animations on a single frame. */
[data-splex-fx="on"] [data-splex-fan-card] {
  animation-timeline: --splex-stage;
  animation-range: cover 15% contain 35%;
  animation-timing-function: cubic-bezier(0.2, 0.8, 0.2, 1);
  animation-fill-mode: both;
  will-change: transform, opacity;
}

/* ALL the opacity lives on the container, and none on the cards.

   Fading the cards individually meant three translucent frames sitting on top
   of one another, so the outer two showed through the middle and you could
   read their edges across it. Opacity on a parent composites the subtree
   first and applies alpha to the result, so the group fades as one image and
   the middle card stays opaque against its own siblings.

   One animation covering fade-in, hold and fade-out, rather than two: a second
   animation on the same element would take opacity over for its whole range
   and cancel the first. The fade-out is needed because the closing panel does
   not cover the pinned stage completely — the panel is 0.8 of a scrollport and
   the pin is a full one, so the top fifth stays on screen, which is exactly
   where the photos sit. */
[data-splex-fx="on"] [data-splex-fan] {
  animation-name: splex-fan;
  animation-timeline: --splex-stage;
  animation-range: cover 15% contain 85%;
  animation-timing-function: linear;
  animation-fill-mode: both;
  will-change: transform, opacity;
}

@keyframes splex-fan {
  0%   { opacity: 0; transform: translateY(0) scale(1); }
  /* Fully opaque well before the cards finish spreading, so they are never
     seen sliding out through one another. */
  25%  { opacity: 1; }
  72%  { opacity: 1; transform: translateY(0) scale(1); }
  100% { opacity: 0; transform: translateY(-56px) scale(0.94); }
}

[data-splex-fx="on"] [data-splex-fan-card="left"]  { animation-name: splex-fan-left; }
[data-splex-fx="on"] [data-splex-fan-card="mid"]   { animation-name: splex-fan-mid; }
[data-splex-fx="on"] [data-splex-fan-card="right"] { animation-name: splex-fan-right; }

/* Offsets are percentages of each card's OWN width, so the spread stays in
   proportion at every breakpoint without the size having to reach the CSS. */
/* Transform only — see the note on the container above. All three start at the
   same size and position, so the middle one hides the other two completely
   until they slide out from behind it. */
@keyframes splex-fan-left {
  from { transform: translateX(0) translateY(0) rotate(0deg) scale(0.86); }
  to   { transform: translateX(-62%) translateY(8px) rotate(-11deg) scale(1); }
}

@keyframes splex-fan-mid {
  from { transform: translateY(0) scale(0.86); }
  to   { transform: translateY(-6px) scale(1); }
}

@keyframes splex-fan-right {
  from { transform: translateX(0) translateY(0) rotate(0deg) scale(0.86); }
  to   { transform: translateX(62%) translateY(8px) rotate(11deg) scale(1); }
}

@keyframes splex-dissolve  { to { opacity: 0; } }
@keyframes splex-part-left  { to { opacity: 0; transform: translateX(-140px); filter: blur(5px); } }
@keyframes splex-part-right { to { opacity: 0; transform: translateX(140px);  filter: blur(5px); } }
@keyframes splex-scatter    { to { opacity: 0; transform: scale(0.5); } }

@keyframes splex-recede {
  to { opacity: 0; transform: translateY(52px) scale(0.78) rotate(-2.5deg); filter: blur(6px); }
}
@keyframes splex-rule-draw {
  from { opacity: 0.9; transform: scaleX(0.15); }
  to   { opacity: 0;   transform: scaleX(1); }
}


@keyframes splex-gallery-pan {
  from { transform: translateX(0); }
  to   { transform: translateX(var(--splex-track-shift, 0px)); }
}

@keyframes splex-gallery-progress {
  from { width: 0%; }
  to   { width: 100%; }
}

@keyframes splex-hero-exit {
  to {
    opacity: 0;
    filter: blur(10px);
    transform: translateY(-44px) scale(0.96);
  }
}

@keyframes splex-hero-drift {
  from { transform: scale(1);    opacity: 0.16; }
  to   { transform: scale(1.18); opacity: 0.04; }
}

@keyframes splex-chapter {
  0% {
    opacity: 0;
    transform: translateY(28px) scale(0.97);
    filter: blur(6px);
  }
  22%, 78% {
    opacity: 1;
    transform: translateY(0) scale(1);
    filter: blur(0);
  }
  100% {
    opacity: 0;
    transform: translateY(-28px) scale(0.97);
    filter: blur(6px);
  }
}
`;

function install(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLESHEET;
  document.head.appendChild(style);
}

/** Scroll-driven animations are Chromium-only as of writing. */
function supportsScrollTimeline(): boolean {
  return (
    typeof CSS !== 'undefined' &&
    typeof CSS.supports === 'function' &&
    CSS.supports('animation-timeline', '--x')
  );
}

/**
 * Walks up from `node` to the element that actually scrolls. Everything the
 * effect measures is relative to that box, not to the window: `<Screen>` puts
 * its content in a ScrollView that sits below the nav bar, so a 100vh pin would
 * hang past the fold by the height of the bar.
 */
function scrollportOf(node: HTMLElement): HTMLElement {
  for (let el = node.parentElement; el; el = el.parentElement) {
    const overflow = getComputedStyle(el).overflowY;
    if (overflow === 'auto' || overflow === 'scroll' || overflow === 'overlay') return el;
  }
  return document.documentElement;
}

export type PinnedScroll = {
  /**
   * True only where the effect can run end to end. False collapses the page to
   * a plain, fully readable stack — which is the right result on native (no
   * sticky), in Safari and Firefox (no scroll timelines), and for anyone who
   * asked for reduced motion, since scroll-linked movement is a well-known
   * migraine and nausea trigger.
   */
  enabled: boolean;
  /** Height of the scrolling box, in px. 0 until measured. */
  viewport: number;
  /** Width of the scrolling box, in px. Wider than the content column, which
   *  is what lets the gallery bleed past the column edges. */
  viewportWidth: number;
  /** Width of the content column the page is laid out in, in px. */
  contentWidth: number;
};

/**
 * Measured before paint so the page does not flash the plain layout and then
 * jump to the pinned one. The app is a client-rendered SPA, so there is no
 * server pass for `useLayoutEffect` to warn about; the `useEffect` branch is
 * only there for native, where this hook does nothing anyway.
 */
const useMeasureEffect = typeof document !== 'undefined' ? useLayoutEffect : useEffect;

/** Attach the returned ref to a wrapper carrying `dataSet={{ splexFx: … }}`. */
export function usePinnedScroll(): PinnedScroll & { ref: RefObject<unknown> } {
  const ref = useRef<unknown>(null);
  const [box, setBox] = useState({ viewport: 0, viewportWidth: 0, contentWidth: 0 });
  const [allowed, setAllowed] = useState(false);

  useMeasureEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    install();

    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setAllowed(supportsScrollTimeline() && !motion.matches);
    sync();
    motion.addEventListener('change', sync);

    const node = ref.current as HTMLElement | null;
    if (!node) return () => motion.removeEventListener('change', sync);

    const scrollport = scrollportOf(node);
    const measure = () =>
      setBox({
        viewport: scrollport.clientHeight,
        viewportWidth: scrollport.clientWidth,
        contentWidth: node.clientWidth,
      });
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(scrollport);
    observer.observe(node);

    return () => {
      motion.removeEventListener('change', sync);
      observer.disconnect();
    };
  }, []);

  return { ref, enabled: allowed && box.viewport > 0, ...box };
}

/**
 * How far the features track slides, in px (negative — it moves left).
 *
 * Written to the document root rather than the element because
 * react-native-web's style pipeline has no notion of custom properties and
 * would drop the declaration.
 */
export function setTrackShift(px: number): void {
  if (typeof document === 'undefined') return;
  document.documentElement.style.setProperty('--splex-track-shift', `${px}px`);
}

/**
 * Emits `data-*` attributes for the CSS above to hook onto.
 *
 * `dataSet` is a react-native-web extension and is absent from React Native's
 * prop types, hence the cast. Keys are camelCase and become dash-separated the
 * same way the DOM `dataset` API does: `heroPin` -> `data-hero-pin`.
 */
export function fxAttrs(data: Record<string, string>): object {
  return Platform.OS === 'web' ? ({ dataSet: data } as object) : {};
}
