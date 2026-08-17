/** Date helpers. Everything here works in ISO `YYYY-MM-DD` local dates. */

export function todayIso(now: Date = new Date()): string {
  return toIsoDate(now);
}

export function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

/** "Today", "Yesterday", or "Mon 17 Aug 2026" for the feed's date headings. */
export function formatDateHeading(iso: string, now: Date = new Date()): string {
  if (!isValidIsoDate(iso)) return iso;

  const today = toIsoDate(now);
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);

  if (iso === today) return 'Today';
  if (iso === toIsoDate(yesterdayDate)) return 'Yesterday';

  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const date = new Date(y, m - 1, d);
  const weekday = date.toLocaleDateString(undefined, { weekday: 'short' });
  const month = date.toLocaleDateString(undefined, { month: 'short' });

  return date.getFullYear() === now.getFullYear()
    ? `${weekday} ${d} ${month}`
    : `${weekday} ${d} ${month} ${y}`;
}

/** "17 August 2026" — the long form used on the date picker trigger. */
export function formatLongDate(iso: string): string {
  if (!isValidIsoDate(iso)) return iso;
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** "August 2026" — the calendar header. */
export function formatMonthYear(iso: string): string {
  const [y, m] = iso.split('-').map(Number) as [number, number];
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export function addMonths(iso: string, delta: number): string {
  const [y, m] = iso.split('-').map(Number) as [number, number];
  return toIsoDate(new Date(y, m - 1 + delta, 1));
}

export function addDays(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return toIsoDate(new Date(y, m - 1, d + delta));
}

/**
 * The calendar grid for the month containing `iso`: whole weeks starting
 * Monday, with nulls padding the days that belong to adjacent months.
 */
export function monthGrid(iso: string): (string | null)[] {
  const [y, m] = iso.split('-').map(Number) as [number, number];
  const first = new Date(y, m - 1, 1);
  const daysInMonth = new Date(y, m, 0).getDate();
  // getDay(): 0=Sunday. Shift so Monday is column 0.
  const leading = (first.getDay() + 6) % 7;

  const cells: (string | null)[] = Array.from({ length: leading }, () => null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(toIsoDate(new Date(y, m - 1, day)));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/** Group any dated records into ordered sections, newest first. */
export function groupByDate<T>(items: T[], getDate: (item: T) => string): { date: string; items: T[] }[] {
  const buckets = new Map<string, T[]>();

  for (const item of items) {
    const date = getDate(item);
    const bucket = buckets.get(date);
    if (bucket) bucket.push(item);
    else buckets.set(date, [item]);
  }

  return [...buckets.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, group]) => ({ date, items: group }));
}
