// Everything is shown in Maldives time (UTC+5, no daylight saving), even on a
// visitor's phone that is still set to their home time zone.
export const TIME_ZONE = 'Indian/Maldives';
const MV_OFFSET_MS = 5 * 3_600_000;

const dayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: TIME_ZONE });
const longDayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TIME_ZONE });
const timeFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: TIME_ZONE });
const wholeFmt = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
const laariFmt = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const dayYearFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: TIME_ZONE });
const yearFmt = new Intl.DateTimeFormat('en-GB', { year: 'numeric', timeZone: TIME_ZONE });
export const formatDay = (iso: string) => dayFmt.format(new Date(iso));
// With the year when it isn't this year, for expiry dates and the like.
export const formatDate = (iso: string, now = new Date()) =>
  (yearFmt.format(new Date(iso)) === yearFmt.format(now) ? dayFmt : dayYearFmt).format(new Date(iso));
export const formatLongDay = (iso: string) => longDayFmt.format(new Date(iso));
export const formatTime = (iso: string) => timeFmt.format(new Date(iso));
export const formatWhen = (iso: string) => `${formatDay(iso)}, ${formatTime(iso)}`;

// Prices are stored in minor units (laari, or cents for USD) to avoid
// floating point drift. Most events are in MVR; some are in USD. Amounts in
// different currencies are never added together.
export type Currency = 'MVR' | 'USD';
export const CURRENCIES: Currency[] = ['MVR', 'USD'];
export const toCurrency = (c: string | null | undefined): Currency => (c === 'USD' ? 'USD' : 'MVR');

const amount = (minor: number) => (minor % 100 === 0 ? wholeFmt : laariFmt).format(minor / 100);

export const formatMoney = (minor: number, currency: Currency = 'MVR') => (minor === 0 ? 'Free' : `${currency} ${amount(minor)}`);

// Balances and totals: always an amount, never "Free".
export const formatAmount = (minor: number, currency: Currency = 'MVR') => `${minor < 0 ? '−' : ''}${currency} ${amount(Math.abs(minor))}`;
export const formatMVR = (laari: number) => formatAmount(laari, 'MVR');

// Wall-clock parts of an instant in Maldives time.
function mvParts(d: Date) {
  const shifted = new Date(d.getTime() + MV_OFFSET_MS);
  return { y: shifted.getUTCFullYear(), m: shifted.getUTCMonth(), day: shifted.getUTCDate(), dow: shifted.getUTCDay() };
}

// The instant for a Maldives wall-clock date and time.
export function mvInstant(y: number, m: number, day: number, hour = 0, minute = 0): Date {
  return new Date(Date.UTC(y, m, day, hour, minute) - MV_OFFSET_MS);
}

export function endOfTodayMv(now = new Date()): Date {
  const p = mvParts(now);
  return mvInstant(p.y, p.m, p.day + 1);
}

// The Maldivian weekend is Friday and Saturday.
export function isThisWeekend(iso: string, now = new Date()): boolean {
  const p = mvParts(now);
  // Days until Friday; on Saturday the weekend started yesterday.
  const toFriday = p.dow === 6 ? -1 : (5 - p.dow + 7) % 7;
  const friday = mvInstant(p.y, p.m, p.day + toFriday);
  const sunday = mvInstant(p.y, p.m, p.day + toFriday + 2);
  const d = new Date(iso);
  return d >= friday && d < sunday && d >= now;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

// Next Friday, the start of the Maldivian weekend, as a Maldives calendar date.
export function nextFridayMv(now = new Date()): string {
  const d = new Date(now.getTime() + MV_OFFSET_MS);
  d.setUTCDate(d.getUTCDate() + ((5 - d.getUTCDay() + 7) % 7 || 7));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

// Maldives wall-clock parts of an instant, as form values.
export function mvDateInput(iso: string): { date: string; time: string } {
  const d = new Date(new Date(iso).getTime() + MV_OFFSET_MS);
  return {
    date: `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`,
    time: `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`,
  };
}

// A date and time typed as Maldives wall-clock time. Invalid input gives an invalid Date.
export function parseMv(date: string, time: string): Date {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const tm = /^(\d{2}):(\d{2})$/.exec(time);
  if (!dm || !tm) return new Date(NaN);
  return mvInstant(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]), Number(tm[1]), Number(tm[2]));
}

// "Fri 23 Oct, 19:30 to 22:30"
export const formatRange = (startIso: string, endIso: string) =>
  `${formatDay(startIso)}, ${formatTime(startIso)} to ${formatTime(endIso)}${
    formatDay(startIso) === formatDay(endIso) ? '' : ` ${formatDay(endIso)}`
  }`;
