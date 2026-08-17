import { useEffect } from 'react';
import { Image, StyleSheet, View, type ViewStyle, useWindowDimensions } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Logo } from '@/components/Logo';
import { Screen } from '@/components/Screen';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { fxAttrs, setTrackShift, usePinnedScroll } from '@/lib/web-scroll-fx';
import { categoryMeta, colors, radius, spacing, tintBackground } from '@/lib/theme';

const FEATURES = [
  {
    icon: 'receipt',
    tint: categoryMeta.food.tint,
    title: 'Track every expense',
    body: 'Record meals, hotels, transport, shopping, activities, tickets, and anything else your group spends money on.',
    detail: 'Choose exactly who paid, who participated, and how the expense should be divided.',
  },
  {
    icon: 'chart',
    tint: categoryMeta.activities.tint,
    title: 'Split expenses your way',
    body: 'Not every expense should be divided equally.',
    detail: 'Equal splits, exact amounts, percentages, or shares — so everyone pays exactly what they should.',
  },
  {
    icon: 'about',
    tint: categoryMeta.flights.tint,
    title: 'Travel across currencies',
    body: 'Multiple currencies in the same trip, with the conversion handled for you.',
    detail: 'A dinner in Thai Baht, a hotel in Singapore Dollars and a taxi in Japanese Yen can all live in one trip.',
  },
  {
    icon: 'balances',
    tint: categoryMeta.transport.tint,
    title: 'Know who owes whom',
    body: 'Splex works out everyone’s balance automatically.',
    detail: 'See who owes, who is owed, how much, and exactly who needs to pay whom.',
  },
  {
    icon: 'settle',
    tint: categoryMeta.lodging.tint,
    title: 'Settle up easily',
    body: 'When someone pays another member back, record the payment.',
    detail: 'Balances update straight away, so the group always has an accurate picture of what remains.',
  },
  {
    icon: 'calendar',
    tint: categoryMeta.shopping.tint,
    title: 'Keep everything organised',
    body: 'Expenses are grouped by date, so your trip history is easy to follow.',
    detail: 'Yesterday’s dinner or day one of the trip — everything stays in order.',
  },
];

/**
 * The closing photo fan. Left and right sit behind the middle and tilt out of
 * it; the middle stays square-on and on top.
 *
 * `rest` is the open position, expressed as a percentage of each frame's own
 * width so the spread stays in proportion at every size.
 */
const PHOTOS = [
  {
    slot: 'left',
    source: require('../assets/photos/christ.jpg'),
    rest: { transform: [{ translateX: '-62%' }, { translateY: 8 }, { rotate: '-11deg' }] },
  },
  {
    slot: 'mid',
    source: require('../assets/photos/tajmahal.webp'),
    rest: { transform: [{ translateY: -6 }] },
  },
  {
    slot: 'right',
    source: require('../assets/photos/eiffel.jpg'),
    rest: { transform: [{ translateX: '62%' }, { translateY: 8 }, { rotate: '11deg' }] },
  },
] as const;

/** Three beats of the same story, handed off across one scroll timeline. */
const CHAPTERS = [
  { text: 'Someone always pays first.', tone: 'default' },
  { text: 'Someone always forgets.', tone: 'primary' },
  { text: 'Splex remembers.', tone: 'positive' },
] as const;

/** How many scrollport heights each pinned section is scrubbed across. */
const HERO_RUNWAY = 2.1;
const CHAPTER_RUNWAY = 2.4;

const GALLERY_GAP = spacing.md;
const GALLERY_PAD = spacing.lg;

/** The white mount around each photo. Deeper at the bottom, as a print is. */
const FRAME_PAD = 6;
const FRAME_PAD_BOTTOM = 12;

/**
 * How far the outer two frames tilt. Repeated in the `rest` transforms below
 * and in the fan keyframes in `lib/web-scroll-fx.ts`; all three must agree.
 * Landscape frames need it here because a tilted card is taller than itself,
 * and the row has to leave room or the corners get cut off.
 */
const TILT_DEG = 11;

/** How far the outer two slide, as a fraction of frame width. Matches the 62% in the keyframes. */
const FAN_SPREAD = 0.62;

/**
 * Largest 3:4 photo whose fanned row fits both the column and the height
 * budget.
 *
 * Worth solving rather than guessing at a fraction of the viewport, on both
 * axes. Across: the row is far wider than one frame — each outer frame is
 * pushed out by 62% of its own width AND rotated, and a rotated rectangle is
 * wider than itself; a plain `width * 0.26` overflowed by 37px at 360, which
 * the scroll container would have silently clipped. Down: the row shares a
 * pinned, viewport-height stage with three lines of text, and portrait frames
 * are tall enough to crowd them out on a short window.
 */
function fanPhotoWidth(availableWidth: number, heightBudget: number): number {
  const tilt = (TILT_DEG * Math.PI) / 180;

  for (let photo = 190; photo > 88; photo -= 2) {
    const frameW = photo + FRAME_PAD * 2;
    const frameH = Math.round((photo * 4) / 3) + FRAME_PAD + FRAME_PAD_BOTTOM;

    // Bounding box of a frame rotated by TILT_DEG.
    const spanW = frameW * Math.cos(tilt) + frameH * Math.sin(tilt);
    const spanH = frameW * Math.sin(tilt) + frameH * Math.cos(tilt);
    // Centre offset of an outer frame, plus half its rotated width.
    const reach = FAN_SPREAD * frameW + spanW / 2;

    if (reach * 2 <= availableWidth && spanH <= heightBudget) return photo;
  }

  return 88;
}

function clamp(min: number, value: number, max: number) {
  return Math.round(Math.min(max, Math.max(min, value)));
}


export default function AboutScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();

  // `enabled` is false on native, in browsers without scroll-driven animations,
  // and under prefers-reduced-motion. In all three the runways collapse and the
  // page reads as an ordinary stack of sections.
  const { ref, enabled, viewport, viewportWidth, contentWidth } = usePinnedScroll();

  const columns = width >= 980 ? 3 : width >= 640 ? 2 : 1;
  const cardWidth = columns === 1 ? '100%' : columns === 2 ? '48%' : '31.5%';

  // Fluid type, done in JS because `clamp()` has no StyleSheet equivalent and
  // native needs the same numbers.
  const titleSize = clamp(34, width * 0.07, 64);
  const chapterSize = clamp(26, width * 0.055, 46);
  const markSize = clamp(220, width * 0.7, 420);
  const leadSize = clamp(28, width * 0.052, 52);
  // Uniform 3:4 portrait windows. The sources are square, 2:3 and 9:16, so all
  // three are cropped to the same shape by `cover` rather than the fan having
  // ragged heights. Sized from the PHOTO, not the frame, so the ratio is exact
  // and the white mount sits outside it.
  // Screen pads the page, the column caps at 640, then the pinned stage pads
  // again — what is left is what the fan has to fit inside.
  const fanRoom = Math.min(640, width - spacing.lg * 2) - spacing.lg * 2;
  // Just under half the pinned stage, leaving the rest for the three lines of
  // text below. `viewport` is 0 before measurement and on native, where the
  // stage is not viewport-height anyway — width alone governs there.
  const fanCeiling = viewport > 0 ? viewport * 0.46 : Number.POSITIVE_INFINITY;
  const photoW = fanPhotoWidth(fanRoom, fanCeiling);
  const photoH = Math.round((photoW * 4) / 3);
  const frameW = photoW + FRAME_PAD * 2;
  const frameH = photoH + FRAME_PAD + FRAME_PAD_BOTTOM;

  // Bounding height of a frame rotated by TILT_DEG, plus room for the drop
  // shadow and the 8px the outer two sit lower.
  const tilt = (TILT_DEG * Math.PI) / 180;
  const fanH = Math.round(frameW * Math.sin(tilt) + frameH * Math.cos(tilt)) + 28;

  const runway = (multiple: number): ViewStyle | null =>
    enabled ? { height: Math.round(viewport * multiple) } : null;

  /**
   * A panel has to fill everything its runway leaves below the pin. If it were
   * shorter, the pinned layer would show through underneath it as it rose.
   */
  const panelFill = (multiple: number): ViewStyle | null =>
    enabled ? { minHeight: Math.round(viewport * (multiple - 1)) } : null;

  // --- Features gallery geometry -------------------------------------------
  // The track bleeds out of the content column to the full width of the
  // scrollport, so cards run off both edges and read as a strip rather than a
  // boxed carousel.
  const galleryCard = clamp(250, viewportWidth * 0.3, 340);
  const trackWidth =
    FEATURES.length * galleryCard + (FEATURES.length - 1) * GALLERY_GAP + GALLERY_PAD * 2;
  const trackShift = Math.max(0, Math.round(trackWidth - viewportWidth));
  // On a viewport wide enough to show every card at once there is nothing to
  // pan, and pinning would just freeze the page for no reason.
  const galleryPinned = enabled && trackShift > 0;
  const bleed = Math.round((contentWidth - viewportWidth) / 2);

  useEffect(() => {
    if (galleryPinned) setTrackShift(-trackShift);
  }, [galleryPinned, trackShift]);

  return (
    <>
      <Stack.Screen options={{ title: 'About' }} />

      <Screen>
        <View ref={ref as never} style={styles.fx} {...fxAttrs({ splexFx: enabled ? 'on' : 'off' })}>
          {/* ---- Pinned hero -------------------------------------------- */}
          <View style={runway(HERO_RUNWAY)} {...fxAttrs({ splexHeroTall: '' })}>
            <View
              style={[styles.heroPin, enabled ? { height: viewport } : null]}
              {...fxAttrs({ splexHeroPin: '' })}
            >
              <View style={styles.heroWash} />

              {/* Drifts closer and dims as the panel comes up over it. */}
              <View style={styles.heroMark} {...fxAttrs({ splexHeroMark: '' })}>
                <Logo size={markSize} />
              </View>

              <View style={styles.heroContent} {...fxAttrs({ splexHeroContent: '' })}>
                <Text variant="caption" tone="faint" align="center" style={styles.eyebrow}>
                  Splex
                </Text>
                <Text
                  variant="display"
                  align="center"
                  style={{ fontSize: titleSize, lineHeight: Math.round(titleSize * 1.08) }}
                >
                  Split trips.{'\n'}Not friendships.
                </Text>
                {enabled ? (
                  <Text variant="caption" tone="faint" align="center" style={styles.eyebrow}>
                    Keep scrolling
                  </Text>
                ) : null}
              </View>
            </View>

            {/* Sits after the pin in flow, so it slides up over it. */}
            <Card
              padding="lg"
              variant="raised"
              style={[styles.heroPanel, enabled ? { minHeight: Math.round(viewport * (HERO_RUNWAY - 1)) } : null]}
            >
              <Text variant="caption" tone="faint" style={styles.eyebrow}>
                The idea
              </Text>
              <Text variant="title">Shared expenses, without the bookkeeping</Text>
              <Text variant="body" tone="muted">
                Splex makes it easy to keep track of shared expenses when travelling with friends,
                family, or groups.
              </Text>
              <Text variant="body" tone="muted">
                Instead of keeping track of who paid for dinner, who owes you for the hotel, or who
                still needs to pay their share, Splex keeps everything organised in one place.
              </Text>

              <PanelSteps items={['Create a trip', 'Add your group', 'Record expenses']} />

              <PanelNote>Splex calculates the balances for you.</PanelNote>

              <View style={styles.heroActions}>
                <Button label="Create a trip" onPress={() => router.push('/trips?new=1')} />
                <Button label="My trips" variant="secondary" onPress={() => router.push('/trips')} />
              </View>
            </Card>
          </View>

          {/* ---- Pinned chapters ----------------------------------------- */}
          <View style={runway(CHAPTER_RUNWAY)} {...fxAttrs({ splexChaptersTall: '' })}>
            <View
              style={[styles.chaptersPin, enabled ? { height: viewport } : null]}
              {...fxAttrs({ splexChaptersPin: '' })}
            >
              <Text variant="caption" tone="faint" align="center" style={styles.eyebrow}>
                How every trip goes
              </Text>

              <View
                style={[
                  styles.chapterStack,
                  enabled ? { height: Math.round(chapterSize * 2.6) } : styles.chapterStackFlow,
                ]}
              >
                {CHAPTERS.map((chapter, index) => (
                  <Text
                    key={chapter.text}
                    variant="title"
                    tone={chapter.tone}
                    align="center"
                    style={[
                      { fontSize: chapterSize, lineHeight: Math.round(chapterSize * 1.15) },
                      enabled ? styles.chapterPinned : null,
                    ]}
                    {...fxAttrs({ splexChapter: String(index + 1) })}
                  >
                    {chapter.text}
                  </Text>
                ))}
              </View>
            </View>
          </View>

          {/* ---- Features, panned sideways ------------------------------- */}
          {galleryPinned ? (
            <View
              style={{ height: viewport + trackShift }}
              {...fxAttrs({ splexGalleryTall: '' })}
            >
              <View
                style={[styles.galleryPin, { height: viewport }]}
                {...fxAttrs({ splexGalleryPin: '' })}
              >
                <Text variant="title" align="center">
                  Everything your group needs
                </Text>

                {/* Clipping lives here, not on the pin — the pin has to let
                    this child escape the content column. */}
                <View style={[styles.galleryWindow, { width: viewportWidth, marginLeft: bleed }]}>
                  <View style={styles.galleryTrack} {...fxAttrs({ splexGalleryTrack: '' })}>
                    {FEATURES.map((feature) => (
                      <FeatureCard key={feature.title} feature={feature} width={galleryCard} />
                    ))}
                  </View>
                </View>

                <View style={styles.progressTrack}>
                  <View style={styles.progressFill} {...fxAttrs({ splexGalleryProgress: '' })} />
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.section}>
              <Text variant="title" align="center">
                Everything your group needs
              </Text>

              <View style={styles.grid}>
                {FEATURES.map((feature) => (
                  <FeatureCard key={feature.title} feature={feature} width={cardWidth} />
                ))}
              </View>
            </View>
          )}
          {/* ---- Stage A: the two lines pull apart ------------------------ */}
          <Stage
            id="a"
            runway={1.7}
            enabled={enabled}
            viewport={viewport}
            leadSize={leadSize}
            pinStyle={styles.pinA}
            eyebrow="The reality"
            lead="Trips are messy."
            sub="Money makes them messier."
            art={
              <View style={styles.dots} {...fxAttrs({ splexStageArt: '' })}>
                {FEATURES.map((feature) => (
                  <View key={feature.title} style={[styles.dot, { backgroundColor: feature.tint }]} />
                ))}
              </View>
            }
          >
            {/* `raised` to match the hero panel: the two share an anatomy, so
                they should share a surface too. */}
            <Card padding="lg" variant="raised" style={[styles.stagePanel, panelFill(1.7)]}>
              <Text variant="caption" tone="faint" style={styles.eyebrow}>
                In practice
              </Text>
              <Text variant="title">Built for real trips</Text>
              <Text variant="body" tone="muted">
                Splex is designed around the problems that actually happen when travelling with a
                group.
              </Text>

              <PanelSteps
                items={[
                  'People pay in different currencies.',
                  'Not everyone participates in every expense.',
                  'Some expenses are split equally while others are not.',
                  'Someone pays for the hotel. Someone else pays for dinner. Another person covers the taxi.',
                ]}
              />

              <PanelNote>
                Splex brings all of those transactions together and turns them into a simple
                picture of who owes whom.
              </PanelNote>
            </Card>
          </Stage>

          {/* ---- Stage B: the whole block recedes ------------------------- */}
          <Stage
            id="b"
            runway={1.6}
            enabled={enabled}
            viewport={viewport}
            leadSize={leadSize}
            pinStyle={styles.pinBare}
            eyebrow="The approach"
            lead="Nothing to learn."
            sub="Add the expense. That is the entire workflow."
            art={<View style={styles.rule} {...fxAttrs({ splexStageArt: '' })} />}
          >
            <Card padding="lg" variant="outlined" style={[styles.stagePanel, panelFill(1.6)]}>
              <Text variant="title">Simple by design</Text>
              <Text variant="body" tone="muted">
                Splex is intentionally designed to stay out of the way.
              </Text>

              <View style={styles.nots}>
                {[
                  'No complicated spreadsheets.',
                  'No mental arithmetic.',
                  'No trying to remember who paid for what.',
                ].map((line) => (
                  <View key={line} style={styles.notChip}>
                    <Text variant="caption" tone="muted">
                      {line}
                    </Text>
                  </View>
                ))}
              </View>

              <Text variant="body">Just add the expense and let Splex handle the rest.</Text>
            </Card>
          </Stage>

          {/* ---- Stage C: the mark blooms open, the closer lifts away ----- */}
          {/* A pinned stage works at the very end of the document where the
              lighter reveal did not: its runway is real scrollable height, so
              `contain 100%` lands exactly at the last pixel of scroll. */}
          <Stage
            id="c"
            runway={1.8}
            enabled={enabled}
            viewport={viewport}
            leadSize={leadSize}
            pinStyle={styles.pinBare}
            eyebrow="Ready when you are"
            lead="Start with one trip."
            sub="Add the people. Splex takes it from there."
            art={
              <View style={[styles.fan, { height: fanH }]} {...fxAttrs({ splexFan: '' })}>
                {PHOTOS.map((photo) => (
                  <View
                    key={photo.slot}
                    style={[
                      styles.frame,
                      { width: frameW, height: frameH },
                      // The resting layout. On web the keyframes end on these
                      // same values, so nothing jumps when the range completes;
                      // on native, where there are no keyframes, this IS the
                      // layout and the fan is simply always open.
                      photo.rest,
                      photo.slot === 'mid' ? styles.frameMid : null,
                    ]}
                    {...fxAttrs({ splexFanCard: photo.slot })}
                  >
                    {/* Sized explicitly rather than with `flex: 1`.
                        react-native-web's Image root carries
                        `flexBasis: auto`, so a flexed image can take its
                        INTRINSIC height as its base and grow from there —
                        which pushed these past the white mount, since the
                        frame does no clipping of its own. These numbers are
                        exactly the frame's content box. */}
                    <Image
                      source={photo.source}
                      style={[styles.photo, { width: photoW, height: photoH }]}
                      resizeMode="cover"
                    />
                  </View>
                ))}
              </View>
            }
          >
            {/* Outlined, matching the "Nothing to learn." panel. */}
            <Card padding="lg" variant="outlined" style={[styles.closer, panelFill(1.8)]}>
              <Logo size={48} />
              <Text variant="title">Splex</Text>
              <Text variant="heading" tone="primary" align="center">
                Split trips. Not friendships.
              </Text>
              <Button
                label="Create a trip"
                onPress={() => router.push('/trips?new=1')}
                fullWidth
                sparkle="always"
              />
            </Card>
          </Stage>
        </View>
      </Screen>
    </>
  );
}

/**
 * The hero's pattern, generalised: a pinned statement that animates away
 * exactly as a panel rises over it.
 *
 * The skeleton is identical for every stage and the character comes entirely
 * from CSS keyed on `id` — one stage's lines pull apart, the next recedes, the
 * last lifts away. Keeping the markup uniform is what lets the three share a
 * single timeline declaration.
 *
 * When the effect is off, the same markup renders as an ordinary heading block
 * above its card, so nothing is lost on native or in Safari.
 */
function Stage({
  id,
  runway,
  enabled,
  viewport,
  pinStyle,
  art,
  eyebrow,
  lead,
  sub,
  leadSize,
  children,
}: {
  id: 'a' | 'b' | 'c';
  /** Scrollport heights the stage is scrubbed across. */
  runway: number;
  enabled: boolean;
  viewport: number;
  pinStyle?: ViewStyle;
  art?: React.ReactNode;
  eyebrow: string;
  lead: string;
  sub: string;
  leadSize: number;
  /** The panel that slides up over the pinned statement. */
  children: React.ReactNode;
}) {
  return (
    <View
      style={enabled ? { height: Math.round(viewport * runway) } : styles.stageFlow}
      {...fxAttrs({ splexStage: id })}
    >
      <View
        style={[styles.stagePin, pinStyle, enabled ? { height: viewport } : null]}
        {...fxAttrs({ splexStagePin: '' })}
      >
        {art}
        <View style={styles.stageText} {...fxAttrs({ splexStageText: '' })}>
          <Text
            variant="caption"
            tone="faint"
            align="center"
            style={styles.eyebrow}
            {...fxAttrs({ splexStageEyebrow: '' })}
          >
            {eyebrow}
          </Text>
          <Text
            variant="display"
            align="center"
            style={{ fontSize: leadSize, lineHeight: Math.round(leadSize * 1.12) }}
            {...fxAttrs({ splexStageLead: '' })}
          >
            {lead}
          </Text>
          <Text
            variant="body"
            tone="muted"
            align="center"
            style={styles.stageSub}
            {...fxAttrs({ splexStageSub: '' })}
          >
            {sub}
          </Text>
        </View>
      </View>

      {children}
    </View>
  );
}

/**
 * The two long panels share one anatomy — eyebrow, title, lead, numbered
 * steps, closing note — so that reading one teaches you how to read the other.
 * These are the two pieces that carry it.
 */
function PanelSteps({ items }: { items: string[] }) {
  return (
    <View style={styles.steps}>
      {items.map((item, index) => (
        <View key={item} style={styles.step}>
          <View style={styles.stepIndex}>
            {/* Tabular figures: 01 and 04 have to occupy the same width or the
                chips read as slightly different sizes down the column. */}
            <Text variant="caption" tone="primary" weight="700" numeric>
              {String(index + 1).padStart(2, '0')}
            </Text>
          </View>
          <Text variant="body" tone="muted" style={styles.stepText}>
            {item}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** The concluding sentence, set apart as a rule-marked pull quote. */
function PanelNote({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.note}>
      <Text variant="body">{children}</Text>
    </View>
  );
}

function FeatureCard({
  feature,
  width,
}: {
  feature: (typeof FEATURES)[number];
  /** A px number in the panned strip, a percentage string in the fallback grid. */
  width: number | string;
}) {
  return (
    <Card padding="lg" style={[styles.feature, { width: width as never }]}>
      <View style={[styles.featureIcon, { backgroundColor: tintBackground(feature.tint) }]}>
        {/* Duotone reads as illustration; the rest of the app stays regular/fill. */}
        <Icon name={feature.icon as IconName} size={24} weight="duotone" color={feature.tint} />
      </View>
      <Text variant="heading">{feature.title}</Text>
      <Text variant="body" tone="muted">
        {feature.body}
      </Text>
      <Text variant="caption" tone="faint">
        {feature.detail}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  fx: { gap: spacing.md },

  heroPin: {
    alignItems: 'center',
    justifyContent: 'center',
    // Clips the mark as it grows past the edges.
    overflow: 'hidden',
    borderRadius: radius.lg,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  heroWash: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.primaryMuted,
    pointerEvents: 'none',
  },
  heroMark: { position: 'absolute', opacity: 0.16, pointerEvents: 'none' },
  heroContent: { alignItems: 'center', gap: spacing.md, maxWidth: 560 },
  eyebrow: { textTransform: 'uppercase', letterSpacing: 2 },

  heroPanel: { gap: spacing.md, justifyContent: 'center' },
  heroActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },

  chaptersPin: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  /** Pinned: every line shares one cell, so nothing reflows as they hand off. */
  chapterStack: { alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  chapterStackFlow: { gap: spacing.lg },
  chapterPinned: { position: 'absolute', maxWidth: 520 },

  galleryPin: { justifyContent: 'center', gap: spacing.xl },
  /** Deliberately no `overflow` on the pin, so this can escape the column. */
  galleryWindow: { overflow: 'hidden' },
  galleryTrack: {
    flexDirection: 'row',
    // Without this the column parent would stretch the track to the window's
    // width; it has to size to its contents so the cards lay out end to end.
    alignSelf: 'flex-start',
    // Every card takes the height of the tallest.
    alignItems: 'stretch',
    gap: GALLERY_GAP,
    paddingHorizontal: GALLERY_PAD,
  },
  progressTrack: {
    alignSelf: 'center',
    width: 180,
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  /** Width is animated from 0 to 100% across the gallery's scroll range. */
  progressFill: { width: 0, height: '100%', backgroundColor: colors.primary },

  // --- Stages ---------------------------------------------------------------
  /** Unpinned fallback: the statement simply sits above its card. */
  stageFlow: { gap: spacing.lg },
  stagePin: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  stageText: { alignItems: 'center', gap: spacing.sm, maxWidth: 560 },
  stageSub: { maxWidth: 420 },
  /** No `marginTop`: any gap here would let the pin show through underneath. */
  stagePanel: { gap: spacing.md, justifyContent: 'center' },

  /** Stage A keeps its own surface, so the three never read as one slide. */
  pinA: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
  },
  /**
   * Bare, for B and C alike. B earns it by claiming to be minimal; C reads
   * better for it too, since the white photo mounts sit on the page rather
   * than on a card on a card. Nothing clips them either, which matters —
   * the outer frames tilt past their own boxes.
   */
  pinBare: {},

  fan: { alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  frame: {
    position: 'absolute',
    // A physical photo mount, so white in both themes. `textInverse` is
    // #FFFFFF in each palette, which keeps it inside the token layer.
    backgroundColor: colors.textInverse,
    padding: FRAME_PAD,
    paddingBottom: FRAME_PAD_BOTTOM,
    borderRadius: 4,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  /** Dealt last, so it sits on top of the two it fans out of. */
  frameMid: { zIndex: 2 },
  photo: { borderRadius: 2 },

  dots: { flexDirection: 'row', gap: spacing.sm },
  // The category tints are tuned for the dark surface and only reach 1.4–2.9:1
  // on a light one, where several of them vanish. A hairline ring gives every
  // dot an edge regardless of theme.
  dot: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  rule: { width: 220, height: 1, backgroundColor: colors.borderStrong },

  section: { gap: spacing.lg, marginTop: spacing.xxl },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, justifyContent: 'center' },
  feature: { gap: spacing.sm, minWidth: 240 },
  featureIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },

  // --- Shared panel anatomy -------------------------------------------------
  steps: { gap: spacing.md, marginTop: spacing.xs },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  stepIndex: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  /** Nudged down so the first line sits on the chip's optical centre. */
  stepText: { flex: 1, paddingTop: 4 },
  note: {
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    paddingLeft: spacing.lg,
    paddingVertical: spacing.xs,
    marginTop: spacing.xs,
  },

  nots: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  notChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },

  closer: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xxl,
  },
});
