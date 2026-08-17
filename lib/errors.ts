/**
 * Turning failures into something a person can act on.
 *
 * Raw Postgres and PostgREST errors leak schema details and read as noise
 * ("new row violates row-level security policy for table \"trips\""). Users get
 * a plain sentence; the original is kept for the console.
 */

type Rawish = { message?: unknown; code?: unknown; details?: unknown; hint?: unknown };

/** Postgres SQLSTATE / PostgREST codes we can say something specific about. */
const BY_CODE: Record<string, string> = {
  '23505': 'That already exists.',
  '23503': 'Something this depends on is missing. Try refreshing.',
  '23514': "Those numbers don't add up. Check the amounts and try again.",
  '42501': "You don't have permission to do that.",
  '22023': 'One of the values entered is not valid.',
  PGRST116: 'That record could not be found.',
  PGRST301: 'Your session expired. Please sign in again.',
};

/** Substring match against the raw message, when the code isn't specific enough. */
const BY_PHRASE: [RegExp, string][] = [
  [/row-level security/i, "You don't have access to that."],
  [/invalid login credentials/i, 'That email or password is incorrect.'],
  [/email not confirmed/i, 'Check your email and confirm your address first.'],
  [/user already registered/i, 'An account with that email already exists.'],
  [/rate limit|too many requests/i, 'Too many attempts. Please wait a moment and try again.'],
  [/failed to fetch|network|offline/i, "Can't reach the server. Check your connection."],
  [/no cached exchange rate/i, null as unknown as string], // already user-facing
  [/username is assigned/i, 'Usernames are assigned automatically and cannot be changed.'],
  [/invite code .* is not valid/i, "That invite link isn't valid any more."],
  [/already been claimed/i, 'Someone has already claimed that person.'],
  [/must be signed in/i, 'Please sign in and try again.'],
];

/**
 * @param fallback what to say when nothing more specific is known
 */
export function friendlyError(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (!error) return fallback;

  // Log the real thing — this is the only place the detail should survive.
  if (typeof console !== 'undefined') console.error('[splex]', error);

  const raw = error as Rawish;
  const message = typeof raw?.message === 'string' ? raw.message : String(error);
  const code = typeof raw?.code === 'string' ? raw.code : '';

  for (const [pattern, replacement] of BY_PHRASE) {
    if (pattern.test(message)) return replacement ?? message;
  }

  if (code && BY_CODE[code]) return BY_CODE[code];

  // Messages we raised ourselves are already written for people: they end in a
  // full stop and contain no schema identifiers.
  if (/\.$/.test(message) && !/"[a-z_]+"/.test(message) && message.length < 160) {
    return message;
  }

  return fallback;
}
