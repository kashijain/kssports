import { BusinessSettings } from '../models.js';
import { financialYear } from '../domain/dates.js';
import { formatInvoiceNumber } from '../domain/numbering.js';
import { HttpError } from '../http.js';

type SettingsLike = {
  invoice: {
    prefix: string;
    separator: string;
    padLength: number;
    startingNumber: number;
    nextNumber: number;
    includeFinancialYear: boolean;
    fyStyle: 'start_year' | 'range';
    fyStartMonth: number;
    resetEachFinancialYear: boolean;
    currentFyStartYear: number;
    lastAllocated?: number;
  };
};

export function peekNextNumber(settings: { invoice?: SettingsLike['invoice'] }, invoiceDateKey: string): string {
  if (!settings.invoice) return 'INV-0001';
  const fy = financialYear(invoiceDateKey, settings.invoice.fyStartMonth || 4);
  const stored = settings.invoice.currentFyStartYear || 0;
  const reset =
    settings.invoice.resetEachFinancialYear &&
    settings.invoice.includeFinancialYear &&
    stored > 0 &&
    fy.startYear > stored;
  const sequence = reset ? settings.invoice.startingNumber : settings.invoice.nextNumber;
  return formatInvoiceNumber({
    prefix: settings.invoice.prefix,
    separator: settings.invoice.separator,
    padLength: settings.invoice.padLength,
    sequence,
    fyStartYear: fy.startYear,
    fyLabel: fy.label,
    includeFinancialYear: settings.invoice.includeFinancialYear,
    fyStyle: settings.invoice.fyStyle,
  });
}

export async function allocateInvoiceNumber(
  businessId: string,
  invoiceDateKey: string,
): Promise<{ number: string; sequence: number; financialYear: string }> {
  const existing = await BusinessSettings.findOne({ businessId });
  if (!existing) throw new HttpError(400, 'Set up invoice numbering before billing.');
  const fy = financialYear(invoiceDateKey, existing.invoice.fyStartMonth || 4);
  const updated = await BusinessSettings.findOneAndUpdate(
    { businessId },
    [
      {
        $set: {
          _reset: {
            $and: [
              { $eq: ['$invoice.resetEachFinancialYear', true] },
              { $eq: ['$invoice.includeFinancialYear', true] },
              { $gt: [{ $ifNull: ['$invoice.currentFyStartYear', 0] }, 0] },
              { $gt: [fy.startYear, { $ifNull: ['$invoice.currentFyStartYear', 0] }] },
            ],
          },
        },
      },
      {
        $set: {
          'invoice.nextNumber': {
            $cond: ['$_reset', '$invoice.startingNumber', '$invoice.nextNumber'],
          },
          'invoice.currentFyStartYear': {
            $cond: [
              { $gt: [fy.startYear, { $ifNull: ['$invoice.currentFyStartYear', 0] }] },
              fy.startYear,
              { $ifNull: ['$invoice.currentFyStartYear', fy.startYear] },
            ],
          },
        },
      },
      {
        $set: {
          'invoice.lastAllocated': '$invoice.nextNumber',
          'invoice.nextNumber': { $add: ['$invoice.nextNumber', 1] },
        },
      },
      { $unset: '_reset' },
    ],
    { new: true },
  );
  if (!updated) throw new HttpError(400, 'Set up invoice numbering before billing.');
  const sequence = updated.invoice.lastAllocated || updated.invoice.nextNumber - 1;
  const number = formatInvoiceNumber({
    prefix: updated.invoice.prefix,
    separator: updated.invoice.separator,
    padLength: updated.invoice.padLength,
    sequence,
    fyStartYear: fy.startYear,
    fyLabel: fy.label,
    includeFinancialYear: updated.invoice.includeFinancialYear,
    fyStyle: updated.invoice.fyStyle as 'start_year' | 'range',
  });
  return { number, sequence, financialYear: fy.label };
}
