export const PAYMENT_METHODS = [
  { id: 'cash', label: 'Cash' },
  { id: 'upi', label: 'UPI' },
  { id: 'bank_transfer', label: 'Bank transfer' },
  { id: 'card', label: 'Card' },
  { id: 'cheque', label: 'Cheque' },
  { id: 'other', label: 'Other' },
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number]['id'];

export const INVOICE_STATUSES = [
  { id: 'draft', label: 'Draft' },
  { id: 'unpaid', label: 'Unpaid' },
  { id: 'partial', label: 'Partially paid' },
  { id: 'paid', label: 'Paid' },
  { id: 'cancelled', label: 'Cancelled' },
] as const;

export type InvoiceStatus = (typeof INVOICE_STATUSES)[number]['id'];

export const ISSUED_STATUSES: InvoiceStatus[] = ['unpaid', 'partial', 'paid'];

export const TEMPLATES = [
  { id: 'classic', label: 'Classic', detail: 'Ruled tax invoice with the shop name centred.' },
  { id: 'modern', label: 'Modern', detail: 'A colour band and a quiet totals column.' },
  { id: 'compact', label: 'Compact', detail: 'Tighter type so more lines fit on one page.' },
] as const;

export type InvoiceTemplate = (typeof TEMPLATES)[number]['id'];

export const UNITS = ['pcs', 'nos', 'kg', 'g', 'm', 'cm', 'l', 'ml', 'box', 'dozen', 'set', 'pair', 'hrs', 'day', 'job'];

export const DEFAULT_TERMS = `1. Please pay by the due date.
2. Goods remain with the seller until they are paid for.
3. Check the items when you receive them.`;

export const DEFAULT_TAX_RATES = [0, 5, 12, 18, 28];

export function statusLabel(status: string): string {
  return INVOICE_STATUSES.find((item) => item.id === status)?.label ?? status;
}

export function methodLabel(method: string): string {
  return PAYMENT_METHODS.find((item) => item.id === method)?.label ?? method;
}

export function isIssued(status: string): boolean {
  return ISSUED_STATUSES.includes(status as InvoiceStatus);
}
