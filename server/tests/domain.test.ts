import { describe, expect, it } from 'vitest';
import { financialYear, fiscalQuarterRange, monthBounds, todayKey } from '../src/domain/dates.js';
import { calculateInvoice, distributePaise } from '../src/domain/gst.js';
import { gstinCheckCharacter, validateGstin, validatePan } from '../src/domain/gstin.js';
import { formatInvoiceNumber } from '../src/domain/numbering.js';
import { amountInWords } from '../src/domain/words.js';

describe('GST calculation', () => {
  it('splits intra-state 18% into equal CGST and SGST', () => {
    const result = calculateInvoice({
      gstApplicable: true,
      sellerStateCode: '08',
      placeOfSupplyStateCode: '08',
      roundOff: 'none',
      lines: [{ quantity: 1, rate: 1000, gstRate: 18 }],
    });
    expect(result.supplyType).toBe('intra');
    expect(result.lines[0]).toMatchObject({ taxableAmount: 1000, cgst: 90, sgst: 90, igst: 0, total: 1180 });
    expect(result.grandTotal).toBe(1180);
    expect(result.roundOff).toBe(0);
  });

  it('charges IGST when the place of supply is a different state', () => {
    const result = calculateInvoice({
      gstApplicable: true,
      sellerStateCode: '08',
      placeOfSupplyStateCode: '27',
      roundOff: 'none',
      lines: [{ quantity: 1, rate: 1000, gstRate: 18 }],
    });
    expect(result.supplyType).toBe('inter');
    expect(result.lines[0]).toMatchObject({ cgst: 0, sgst: 0, igst: 180, total: 1180 });
  });

  it('treats 0% as a real rate with no tax', () => {
    const result = calculateInvoice({
      gstApplicable: true,
      sellerStateCode: '08',
      placeOfSupplyStateCode: '8',
      roundOff: 'none',
      lines: [{ quantity: 1, rate: 1000, gstRate: 0 }],
    });
    expect(result.supplyType).toBe('intra');
    expect(result.taxAmount).toBe(0);
    expect(result.grandTotal).toBe(1000);
  });

  it('keeps several rates in one invoice', () => {
    const result = calculateInvoice({
      gstApplicable: true,
      sellerStateCode: '08',
      placeOfSupplyStateCode: '08',
      roundOff: 'none',
      lines: [
        { quantity: 1, rate: 1000, gstRate: 5 },
        { quantity: 1, rate: 1000, gstRate: 18 },
      ],
    });
    expect(result.cgst).toBe(115);
    expect(result.sgst).toBe(115);
    expect(result.grandTotal).toBe(2230);
  });

  it('applies item and invoice discounts before tax', () => {
    const result = calculateInvoice({
      gstApplicable: true,
      sellerStateCode: '27',
      placeOfSupplyStateCode: '27',
      roundOff: 'none',
      invoiceDiscountMode: 'percent',
      invoiceDiscountValue: 10,
      lines: [{ quantity: 2, rate: 500, discountMode: 'amount', discountValue: 0, gstRate: 18 }],
    });
    expect(result.invoiceDiscount).toBe(100);
    expect(result.taxableAmount).toBe(900);
    expect(result.lines[0].cgst).toBe(81);
    expect(result.lines[0].sgst).toBe(81);
    expect(result.grandTotal).toBe(1062);
  });

  it('supports decimal quantities', () => {
    const result = calculateInvoice({
      gstApplicable: true,
      sellerStateCode: '08',
      placeOfSupplyStateCode: '27',
      roundOff: 'none',
      lines: [{ quantity: 2.5, rate: 80, gstRate: 18 }],
    });
    expect(result.lines[0].taxableAmount).toBe(200);
    expect(result.lines[0].igst).toBe(36);
    expect(result.grandTotal).toBe(236);
  });

  it('rounds the grand total to the nearest rupee and records the round off', () => {
    const result = calculateInvoice({
      gstApplicable: true,
      sellerStateCode: '08',
      placeOfSupplyStateCode: '08',
      roundOff: 'nearest_rupee',
      lines: [{ quantity: 1, rate: 100.1, gstRate: 0 }],
    });
    expect(result.exactTotal).toBe(100.1);
    expect(result.grandTotal).toBe(100);
    expect(result.roundOff).toBe(-0.1);
  });

  it('splits an odd paise of GST without losing a paisa', () => {
    const result = calculateInvoice({
      gstApplicable: true,
      sellerStateCode: '08',
      placeOfSupplyStateCode: '08',
      roundOff: 'none',
      lines: [{ quantity: 1, rate: 10.03, gstRate: 18 }],
    });
    expect(result.lines[0].taxAmount).toBe(1.81);
    expect(result.lines[0].cgst + result.lines[0].sgst).toBe(1.81);
  });

  it('backs GST out of an inclusive price', () => {
    const result = calculateInvoice({
      gstApplicable: true,
      sellerStateCode: '08',
      placeOfSupplyStateCode: '08',
      priceMode: 'inclusive',
      roundOff: 'none',
      lines: [{ quantity: 1, rate: 1180, gstRate: 18 }],
    });
    expect(result.taxableAmount).toBe(1000);
    expect(result.cgst).toBe(90);
    expect(result.sgst).toBe(90);
    expect(result.grandTotal).toBe(1180);
  });

  it('does not invent GST when the seller is not registered', () => {
    const result = calculateInvoice({
      gstApplicable: false,
      roundOff: 'none',
      lines: [{ quantity: 1, rate: 1000, gstRate: 18 }],
    });
    expect(result.supplyType).toBe('non_gst');
    expect(result.lines[0].gstRate).toBe(0);
    expect(result.taxAmount).toBe(0);
    expect(result.grandTotal).toBe(1000);
  });

  it('distributes an invoice discount without losing paise', () => {
    const shares = distributePaise(100, [100, 200, 300]);
    expect(shares.reduce((sum, share) => sum + share, 0)).toBe(100);
    expect(shares.every((share, index) => share <= [100, 200, 300][index])).toBe(true);
  });

  it('rejects a discount larger than the line', () => {
    expect(() =>
      calculateInvoice({
        gstApplicable: false,
        lines: [{ quantity: 1, rate: 100, discountMode: 'amount', discountValue: 150 }],
      }),
    ).toThrow(/discount/i);
  });
});

describe('GSTIN', () => {
  it('accepts a checksum it generated and rejects a tampered one', () => {
    const body = '08AAPFM8421Q1Z';
    const gstin = body + gstinCheckCharacter(body);
    expect(validateGstin(gstin, { expectedStateCode: '08', expectedPan: 'AAPFM8421Q' }).ok).toBe(true);
    const tampered = `${gstin.slice(0, 14)}${gstin.endsWith('A') ? 'B' : 'A'}`;
    expect(validateGstin(tampered).ok).toBe(false);
  });

  it('checks the state and PAN embedded in the GSTIN', () => {
    const gstin = `27ABCDE1234F1Z${gstinCheckCharacter('27ABCDE1234F1Z')}`;
    const state = validateGstin(gstin, { expectedStateCode: '08' });
    expect(state.ok).toBe(false);
    const pan = validateGstin(gstin, { expectedPan: 'AAAAA0000A' });
    expect(pan.ok).toBe(false);
  });

  it('validates PAN shape only', () => {
    expect(validatePan('abcde1234f')).toEqual({ ok: true, pan: 'ABCDE1234F' });
    expect(validatePan('ABCDE12345').ok).toBe(false);
  });
});

describe('amount in words and dates', () => {
  it('writes the spec example', () => {
    expect(amountInWords(1180)).toBe('One Thousand One Hundred Eighty Rupees Only');
    expect(amountInWords(100000)).toBe('One Lakh Rupees Only');
    expect(amountInWords(1180.5)).toBe('One Thousand One Hundred Eighty Rupees and Fifty Paise Only');
    expect(amountInWords(0)).toBe('Zero Rupees Only');
  });

  it('uses the Indian financial year', () => {
    expect(financialYear('2026-03-31').label).toBe('2025-26');
    expect(financialYear('2026-04-01').startYear).toBe(2026);
    expect(financialYear('2026-10-22').label).toBe('2026-27');
    expect(monthBounds(2026, 10)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(monthBounds(2028, 2).to).toBe('2028-02-29');
    expect(fiscalQuarterRange(2026, 10)).toEqual({ from: '2026-10-01', to: '2026-12-31' });
    expect(fiscalQuarterRange(2026, 1)).toEqual({ from: '2026-01-01', to: '2026-03-31' });
  });

  it('formats invoice numbers', () => {
    expect(
      formatInvoiceNumber({
        prefix: 'INV',
        separator: '-',
        padLength: 4,
        sequence: 1,
        fyStartYear: 2026,
        fyLabel: '2026-27',
        includeFinancialYear: true,
        fyStyle: 'start_year',
      }),
    ).toBe('INV-2026-0001');
  });

  it('resolves the business timezone instead of the server clock', () => {
    const instant = new Date('2026-10-22T20:30:00Z');
    expect(todayKey('Asia/Kolkata', instant)).toBe('2026-10-23');
    expect(todayKey('UTC', instant)).toBe('2026-10-22');
  });
});
