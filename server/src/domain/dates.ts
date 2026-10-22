import { DomainError } from './errors.js';

export interface DateParts {
  year: number;
  month: number;
  day: number;
}

export function parseDateKey(key: string): DateParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) throw new DomainError('Use a valid date.');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 2000 || year > 2100) throw new DomainError('Use a date between 2000 and 2100.');
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) {
    throw new DomainError('Use a valid date.');
  }
  return { year, month, day };
}

export function dateKey(parts: DateParts): string {
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

export function addDays(key: string, days: number): string {
  const { year, month, day } = parseDateKey(key);
  const dt = new Date(Date.UTC(year, month - 1, day));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function monthBounds(year: number, month: number): { from: string; to: string } {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, '0');
  return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${String(last).padStart(2, '0')}` };
}

export function startOfWeekMonday(key: string): string {
  const { year, month, day } = parseDateKey(key);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const delta = weekday === 0 ? -6 : 1 - weekday;
  return addDays(key, delta);
}

function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export function financialYear(key: string, startMonth = 4): { startYear: number; label: string } {
  const { year, month } = parseDateKey(key);
  const startYear = month >= startMonth ? year : year - 1;
  const end = (startYear + 1) % 100;
  return { startYear, label: `${startYear}-${String(end).padStart(2, '0')}` };
}

export function financialYearRange(year: number, month: number, startMonth = 4): { from: string; to: string } {
  const startYear = month >= startMonth ? year : year - 1;
  const from = `${startYear}-${String(startMonth).padStart(2, '0')}-01`;
  const end = addMonths(startYear, startMonth, 11);
  return { from, to: monthBounds(end.year, end.month).to };
}

export function fiscalQuarterRange(year: number, month: number, startMonth = 4): { from: string; to: string } {
  const startYear = month >= startMonth ? year : year - 1;
  const quarter = Math.floor((((month - startMonth + 12) % 12) / 3));
  const start = addMonths(startYear, startMonth, quarter * 3);
  const end = addMonths(start.year, start.month, 2);
  return {
    from: `${start.year}-${String(start.month).padStart(2, '0')}-01`,
    to: monthBounds(end.year, end.month).to,
  };
}

export interface DateRange {
  from: string;
  to: string;
  label: string;
}

export function reportPresets(today: string, fyStartMonth = 4): Record<'today' | 'week' | 'month' | 'quarter' | 'fy', DateRange> {
  const { year, month } = parseDateKey(today);
  return {
    today: { from: today, to: today, label: 'Today' },
    week: { from: startOfWeekMonday(today), to: today, label: 'This week' },
    month: { ...monthBounds(year, month), label: 'This month' },
    quarter: { ...fiscalQuarterRange(year, month, fyStartMonth), label: 'This quarter' },
    fy: { ...financialYearRange(year, month, fyStartMonth), label: 'Financial year' },
  };
}

export function todayKey(timeZone: string, now = new Date()): string {
  const zone = safeTimeZone(timeZone);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function safeTimeZone(timeZone: string | undefined | null): string {
  const fallback = 'Asia/Kolkata';
  if (!timeZone) return fallback;
  try {
    Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return fallback;
  }
}

export function formatDisplayDate(key: string): string {
  if (!key) return '—';
  try {
    const { year, month, day } = parseDateKey(key);
    return new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(year, month - 1, day)));
  } catch {
    return key;
  }
}

export function eachDate(from: string, to: string): string[] {
  const days: string[] = [];
  let cursor = from;
  let guard = 0;
  while (cursor <= to && guard < 400) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
    guard += 1;
  }
  return days;
}
