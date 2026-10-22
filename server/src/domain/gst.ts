import { DomainError } from './errors.js';
import { fromPaise, roundRate, toPaise } from './money.js';
import { normalizeStateCode } from './states.js';

export type DiscountMode = 'amount' | 'percent';
export type RoundOffMode = 'nearest_rupee' | 'none';
export type PriceMode = 'exclusive' | 'inclusive';
export type SupplyType = 'intra' | 'inter' | 'non_gst';

export interface LineInput {
  quantity: number;
  rate: number;
  discountMode?: DiscountMode;
  discountValue?: number;
  gstRate?: number;
  hsnSac?: string;
}

export interface CalculateInput {
  lines: LineInput[];
  invoiceDiscountMode?: DiscountMode;
  invoiceDiscountValue?: number;
  /** When false, the document is a plain bill and tax amounts stay zero. */
  gstApplicable: boolean;
  sellerStateCode?: string;
  placeOfSupplyStateCode?: string;
  roundOff?: RoundOffMode;
  /** Exclusive adds GST on top. Inclusive treats the rate as GST-inclusive. */
  priceMode?: PriceMode;
}

export interface LineResult {
  quantity: number;
  rate: number;
  discountMode: DiscountMode;
  discountValue: number;
  grossAmount: number;
  discountAmount: number;
  invoiceDiscountShare: number;
  taxableAmount: number;
  gstRate: number;
  cgst: number;
  sgst: number;
  igst: number;
  taxAmount: number;
  total: number;
  hsnSac: string;
}

export interface TaxBucket {
  hsnSac: string;
  gstRate: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  taxAmount: number;
}

export interface InvoiceTotals {
  supplyType: SupplyType;
  lines: LineResult[];
  subtotal: number;
  itemDiscount: number;
  invoiceDiscount: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  taxAmount: number;
  exactTotal: number;
  roundOff: number;
  grandTotal: number;
  buckets: TaxBucket[];
}

function discountOn(basePaise: number, mode: DiscountMode, value: number, label: string): number {
  if (value < 0) throw new DomainError(`${label} cannot be negative.`);
  if (basePaise < 0) throw new DomainError(`${label} base is invalid.`);
  if (mode === 'percent') {
    if (value > 100) throw new DomainError(`${label} percent cannot exceed 100.`);
    return Math.min(basePaise, Math.round((basePaise * value) / 100));
  }
  const amount = toPaise(value);
  if (amount > basePaise) throw new DomainError(`${label} is more than the amount it applies to.`);
  return amount;
}

export function distributePaise(total: number, weights: number[]): number[] {
  if (weights.length === 0 || total === 0) return weights.map(() => 0);
  const sum = weights.reduce((acc, weight) => acc + weight, 0);
  if (sum <= 0) return weights.map(() => 0);
  if (total > sum) throw new DomainError('Invoice discount is more than the amount it applies to.');
  const raw = weights.map((weight) => (total * weight) / sum);
  const shares = raw.map((value) => Math.floor(value));
  let left = total - shares.reduce((acc, share) => acc + share, 0);
  const order = raw
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index);
  let guard = 0;
  while (left > 0 && guard < 10000) {
    let progressed = false;
    for (const entry of order) {
      if (left <= 0) break;
      if (shares[entry.index] < weights[entry.index]) {
        shares[entry.index] += 1;
        left -= 1;
        progressed = true;
      }
    }
    if (!progressed) break;
    guard += 1;
  }
  if (left !== 0) throw new DomainError('Could not apply the invoice discount.');
  return shares;
}

function splitIntra(taxPaise: number): { cgst: number; sgst: number } {
  const cgst = Math.round(taxPaise / 2);
  return { cgst, sgst: taxPaise - cgst };
}

function emptyTotals(supplyType: SupplyType): InvoiceTotals {
  return {
    supplyType,
    lines: [],
    subtotal: 0,
    itemDiscount: 0,
    invoiceDiscount: 0,
    taxableAmount: 0,
    cgst: 0,
    sgst: 0,
    igst: 0,
    taxAmount: 0,
    exactTotal: 0,
    roundOff: 0,
    grandTotal: 0,
    buckets: [],
  };
}

/**
 * GST engine.
 * Intra-state (seller state = place of supply): CGST and SGST are each half of the GST, in paise, and always sum to the GST.
 * Inter-state: the full GST is IGST.
 * Rates are inputs. This function does not decide which rate a product should use.
 */
export function calculateInvoice(input: CalculateInput): InvoiceTotals {
  const priceMode: PriceMode = input.priceMode ?? 'exclusive';
  const roundOffMode: RoundOffMode = input.roundOff ?? 'nearest_rupee';
  const gstApplicable = Boolean(input.gstApplicable);
  let supplyType: SupplyType = 'non_gst';
  if (gstApplicable) {
    const seller = normalizeStateCode(input.sellerStateCode);
    const place = normalizeStateCode(input.placeOfSupplyStateCode);
    if (!seller || !place) throw new DomainError('Seller state and place of supply are required on a GST invoice.');
    supplyType = seller === place ? 'intra' : 'inter';
  }

  if (input.lines.length === 0) return emptyTotals(supplyType);

  const prepared = input.lines.map((line) => {
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
      throw new DomainError('Quantity must be greater than zero.');
    }
    const quantity = Math.round(line.quantity * 1000) / 1000;
    if (quantity <= 0) throw new DomainError('Quantity must be greater than zero.');
    if (quantity > 1_000_000) throw new DomainError('Quantity is too large.');
    const ratePaise = toPaise(line.rate);
    if (ratePaise < 0) throw new DomainError('Rate cannot be negative.');
    const gross = Math.round(quantity * ratePaise);
    if (gross > 100_000_000_000) throw new DomainError('Line amount is too large.');
    const mode = line.discountMode ?? 'amount';
    const discount = discountOn(gross, mode, line.discountValue ?? 0, 'Item discount');
    const gstRate = gstApplicable ? roundRate(line.gstRate ?? 0) : 0;
    if (gstRate < 0 || gstRate > 100) throw new DomainError('GST rate must be between 0 and 100.');
    return {
      quantity,
      rate: fromPaise(ratePaise),
      discountMode: mode,
      discountValue: line.discountValue ?? 0,
      gross,
      discount,
      base: gross - discount,
      gstRate,
      hsnSac: (line.hsnSac ?? '').trim(),
    };
  });

  const invoiceDiscount = discountOn(
    prepared.reduce((sum, line) => sum + line.base, 0),
    input.invoiceDiscountMode ?? 'amount',
    input.invoiceDiscountValue ?? 0,
    'Invoice discount',
  );
  const shares = distributePaise(
    invoiceDiscount,
    prepared.map((line) => line.base),
  );

  const lines: LineResult[] = prepared.map((line, index) => {
    const share = shares[index] ?? 0;
    const net = line.base - share;
    let taxable = net;
    let tax = 0;
    if (gstApplicable && line.gstRate > 0 && net > 0) {
      if (priceMode === 'inclusive') {
        tax = Math.round((net * line.gstRate) / (100 + line.gstRate));
        taxable = net - tax;
      } else {
        taxable = net;
        tax = Math.round((taxable * line.gstRate) / 100);
      }
    }
    let cgst = 0;
    let sgst = 0;
    let igst = 0;
    if (supplyType === 'intra') {
      const split = splitIntra(tax);
      cgst = split.cgst;
      sgst = split.sgst;
    } else if (supplyType === 'inter') {
      igst = tax;
    }
    const total = priceMode === 'inclusive' && gstApplicable ? net : taxable + tax;
    return {
      quantity: line.quantity,
      rate: line.rate,
      discountMode: line.discountMode,
      discountValue: line.discountValue,
      grossAmount: fromPaise(line.gross),
      discountAmount: fromPaise(line.discount),
      invoiceDiscountShare: fromPaise(share),
      taxableAmount: fromPaise(taxable),
      gstRate: line.gstRate,
      cgst: fromPaise(cgst),
      sgst: fromPaise(sgst),
      igst: fromPaise(igst),
      taxAmount: fromPaise(tax),
      total: fromPaise(total),
      hsnSac: line.hsnSac,
    };
  });

  const sumPaise = (pick: (line: LineResult) => number) => lines.reduce((acc, line) => acc + toPaise(pick(line)), 0);
  const subtotal = sumPaise((line) => line.grossAmount);
  const itemDiscount = sumPaise((line) => line.discountAmount);
  const taxableAmount = sumPaise((line) => line.taxableAmount);
  const cgst = sumPaise((line) => line.cgst);
  const sgst = sumPaise((line) => line.sgst);
  const igst = sumPaise((line) => line.igst);
  const taxAmount = cgst + sgst + igst;
  const exactTotal = sumPaise((line) => line.total);
  let grand = exactTotal;
  if (roundOffMode === 'nearest_rupee') grand = Math.round(exactTotal / 100) * 100;
  const buckets = new Map<string, TaxBucket>();
  for (const line of lines) {
    const key = `${line.hsnSac}|${line.gstRate}`;
    const current = buckets.get(key) ?? {
      hsnSac: line.hsnSac,
      gstRate: line.gstRate,
      taxableAmount: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
      taxAmount: 0,
    };
    current.taxableAmount = fromPaise(toPaise(current.taxableAmount) + toPaise(line.taxableAmount));
    current.cgst = fromPaise(toPaise(current.cgst) + toPaise(line.cgst));
    current.sgst = fromPaise(toPaise(current.sgst) + toPaise(line.sgst));
    current.igst = fromPaise(toPaise(current.igst) + toPaise(line.igst));
    current.taxAmount = fromPaise(toPaise(current.taxAmount) + toPaise(line.taxAmount));
    buckets.set(key, current);
  }

  return {
    supplyType,
    lines,
    subtotal: fromPaise(subtotal),
    itemDiscount: fromPaise(itemDiscount),
    invoiceDiscount: fromPaise(invoiceDiscount),
    taxableAmount: fromPaise(taxableAmount),
    cgst: fromPaise(cgst),
    sgst: fromPaise(sgst),
    igst: fromPaise(igst),
    taxAmount: fromPaise(taxAmount),
    exactTotal: fromPaise(exactTotal),
    roundOff: fromPaise(grand - exactTotal),
    grandTotal: fromPaise(grand),
    buckets: [...buckets.values()],
  };
}
