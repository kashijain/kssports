export function inr(value: number | null | undefined) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0);
}

export function prettyDate(key?: string) {
  if (!key) return '—';
  const [year, month, day] = key.split('-').map(Number);
  if (!year || !month || !day) return key;
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
}

export function todayIn(timeZone = 'Asia/Kolkata') {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  }
}

export function addDays(key: string, days: number) {
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function statusTone(status: string) {
  if (status === 'paid') return 'bg-teal/15 text-teal';
  if (status === 'partial') return 'bg-amber text-ink';
  if (status === 'unpaid') return 'bg-clay/10 text-clay-dark';
  if (status === 'cancelled') return 'bg-ink/10 text-muted line-through';
  return 'bg-ink/5 text-muted';
}
