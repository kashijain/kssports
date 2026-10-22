export interface NumberFormat {
  prefix: string;
  separator: string;
  padLength: number;
  sequence: number;
  fyStartYear: number;
  fyLabel: string;
  includeFinancialYear: boolean;
  fyStyle: 'start_year' | 'range';
}

export function formatInvoiceNumber(opts: NumberFormat): string {
  const pad = Math.min(Math.max(Math.trunc(opts.padLength) || 4, 1), 10);
  const seq = String(Math.trunc(opts.sequence)).padStart(pad, '0');
  const prefix = (opts.prefix || 'INV').trim() || 'INV';
  const sep = opts.separator || '-';
  if (!opts.includeFinancialYear) return `${prefix}${sep}${seq}`;
  const fy = opts.fyStyle === 'range' ? opts.fyLabel : String(opts.fyStartYear);
  return `${prefix}${sep}${fy}${sep}${seq}`;
}

export function isValidInvoiceNumber(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9\-/_.]{0,39}$/.test(value);
}
