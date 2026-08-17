/**
 * Working out what to call someone in the header greeting.
 *
 * Pure, so the awkward cases are testable: missing names, full names, very long
 * single words, and names in scripts the display serif cannot render.
 */

import { isLatinOnly } from './theme';

/** Longer than this and the name is ellipsised rather than wrapping the header. */
export const MAX_NAME_LENGTH = 18;

export type Greeting = {
  /** What to render after "Hi," — never empty, never "undefined". */
  name: string;
  /** False when the name needs the system font stack instead of the serif. */
  useSerif: boolean;
  /** True when the name was shortened, so a title attribute can carry the full one. */
  truncated: boolean;
};

/**
 * @param displayName the profile display name, which may be a full name
 * @param email used only as a last resort before falling back to "there"
 */
export function resolveGreeting(
  displayName?: string | null,
  email?: string | null,
): Greeting {
  const source = firstNameOf(displayName) || firstNameOf(localPartOf(email));

  if (!source) {
    // Never "Hi, undefined" — and never a bare "Hi," either.
    return { name: 'there', useSerif: true, truncated: false };
  }

  const truncated = [...source].length > MAX_NAME_LENGTH;
  const name = truncated ? `${[...source].slice(0, MAX_NAME_LENGTH).join('')}…` : source;

  return { name, useSerif: isLatinOnly(source), truncated };
}

/** "Aditi Rao" -> "Aditi". Handles extra whitespace and empty input. */
function firstNameOf(value?: string | null): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return '';
  return trimmed.split(/\s+/)[0] ?? '';
}

/** "akshay@example.com" -> "akshay". Returns '' for anything unusable. */
function localPartOf(email?: string | null): string {
  const trimmed = (email ?? '').trim();
  if (!trimmed || !trimmed.includes('@')) return '';
  return trimmed.split('@')[0] ?? '';
}
