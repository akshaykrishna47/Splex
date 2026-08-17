import { describe, expect, it } from 'vitest';
import { ACCENT, PALETTE, colors, cssVarName, isLatinOnly } from '@/lib/theme';
import { MAX_NAME_LENGTH, resolveGreeting } from '@/lib/greeting';

/** WCAG relative luminance. */
function luminance(hex: string): number {
  const clean = hex.replace('#', '');
  const channels = [0, 2, 4].map((i) => {
    const value = parseInt(clean.slice(i, i + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const AA_NORMAL = 4.5;

describe('accent contrast', () => {
  it('passes AA in the light theme', () => {
    const ratio = contrast(ACCENT.light.color, ACCENT.light.on);
    expect(ratio).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('passes AA in the dark theme', () => {
    const ratio = contrast(ACCENT.dark.color, ACCENT.dark.on);
    expect(ratio).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('the shipped accent token is the dark-theme value', () => {
    expect(colors.accent).toBe(ACCENT.dark.color);
    expect(contrast(colors.accent, colors.bg)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('rejects the naive yellow-on-white that prompted this token', () => {
    // #FFEB3B on white is ~1.1:1. This test exists so nobody reintroduces it.
    expect(contrast('#FFEB3B', '#FFFFFF')).toBeLessThan(AA_NORMAL);
  });

  it('keeps body and muted text above AA on the app background', () => {
    expect(contrast(colors.text, colors.bg)).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(contrast(colors.textMuted, colors.bg)).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});

describe('both palettes meet AA', () => {
  const THEMES = ['dark', 'light'] as const;

  // Foregrounds that carry meaning. `textFaint` is excluded: it is
  // de-emphasised hint text and sits in the 3:1 large-text band by design, in
  // both themes.
  const FOREGROUNDS = ['text', 'textMuted', 'primaryText', 'positive', 'negative', 'warning', 'accent'] as const;

  for (const theme of THEMES) {
    const palette = PALETTE[theme];

    it(`${theme}: every foreground clears 4.5:1 on the background`, () => {
      for (const token of FOREGROUNDS) {
        const ratio = contrast(palette[token], palette.bg);
        expect(ratio, `${theme}.${token} (${palette[token]}) on ${palette.bg}`).toBeGreaterThanOrEqual(
          AA_NORMAL,
        );
      }
    });

    it(`${theme}: label text on the primary fill clears 4.5:1`, () => {
      expect(contrast(palette.primary, palette.textInverse)).toBeGreaterThanOrEqual(AA_NORMAL);
    });

    it(`${theme}: hint text stays at least large-text legible`, () => {
      expect(contrast(palette.textFaint, palette.bg)).toBeGreaterThanOrEqual(3);
    });

    it(`${theme}: surfaces are distinguishable from the background`, () => {
      expect(palette.surface).not.toBe(palette.bg);
      expect(palette.surfaceMuted).not.toBe(palette.surface);
    });
  }

  it('defines exactly the same tokens in both themes', () => {
    expect(Object.keys(PALETTE.light).sort()).toEqual(Object.keys(PALETTE.dark).sort());
  });

  it('the two themes are actually different', () => {
    expect(PALETTE.light.bg).not.toBe(PALETTE.dark.bg);
    expect(PALETTE.light.text).not.toBe(PALETTE.dark.text);
  });

  it('maps token names to kebab-case CSS variables', () => {
    expect(cssVarName('bg')).toBe('--splex-bg');
    expect(cssVarName('surfaceMuted')).toBe('--splex-surface-muted');
    expect(cssVarName('primaryText')).toBe('--splex-primary-text');
  });
});

describe('isLatinOnly', () => {
  it('accepts Latin names including accents', () => {
    for (const name of ['Akshay', 'José', 'Łukasz', "O'Neill", 'Anne-Marie']) {
      expect(isLatinOnly(name)).toBe(true);
    }
  });

  it('rejects scripts the display serif cannot render', () => {
    for (const name of ['陈美玲', 'முருகன்', 'محمد', 'Ольга', 'Δημήτρης', '한지민']) {
      expect(isLatinOnly(name)).toBe(false);
    }
  });

  it('rejects mixed names, so the font never falls back mid-word', () => {
    expect(isLatinOnly('陈 Mei')).toBe(false);
  });

  it('treats emoji and punctuation as neutral', () => {
    expect(isLatinOnly('')).toBe(true);
    expect(isLatinOnly('👋')).toBe(true);
  });
});

describe('resolveGreeting', () => {
  it('uses the first name when a full name is stored', () => {
    expect(resolveGreeting('Aditi Rao').name).toBe('Aditi');
  });

  it('falls back to the email local part, then to "there"', () => {
    expect(resolveGreeting(null, 'akshay@example.com').name).toBe('akshay');
    expect(resolveGreeting(null, null).name).toBe('there');
    expect(resolveGreeting('   ', '').name).toBe('there');
  });

  it('never renders undefined', () => {
    expect(resolveGreeting(undefined, undefined).name).toBe('there');
    expect(resolveGreeting(undefined, undefined).name).not.toMatch(/undefined/);
  });

  it('truncates a very long name with an ellipsis', () => {
    const result = resolveGreeting('Bartholomewsteinbergsonhaus');
    expect(result.truncated).toBe(true);
    expect(result.name.endsWith('…')).toBe(true);
    expect([...result.name]).toHaveLength(MAX_NAME_LENGTH + 1);
  });

  it('drops the serif for non-Latin names but keeps them as the name', () => {
    const chinese = resolveGreeting('陈美玲');
    expect(chinese.useSerif).toBe(false);
    expect(chinese.name).toBe('陈美玲');

    const tamil = resolveGreeting('முருகன்');
    expect(tamil.useSerif).toBe(false);

    expect(resolveGreeting('Akshay').useSerif).toBe(true);
  });

  it('counts characters, not code units, when truncating', () => {
    // Naive .length would cut an emoji or CJK name in the middle of a pair.
    const result = resolveGreeting('陈'.repeat(30));
    expect([...result.name]).toHaveLength(MAX_NAME_LENGTH + 1);
  });
});
