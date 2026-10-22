import crypto from 'node:crypto';
import { isIssued, type InvoiceStatus, type PaymentMethod } from '../domain/constants.js';
import { addDays, parseDateKey, todayKey } from '../domain/dates.js';
import { DomainError } from '../domain/errors.js';
import { calculateInvoice, type InvoiceTotals } from '../domain/gst.js';
import { isValidInvoiceNumber } from '../domain/numbering.js';
import { findState } from '../domain/states.js';
import { fromPaise, formatInr, roundRate, toPaise } from '../domain/money.js';
import { HttpError } from '../http.js';
import { Business, BusinessSettings, Customer, Invoice, Payment, Product } from '../models.js';
import { presentInvoiceDetail } from '../present.js';
import type { InvoiceInput } from '../schemas.js';
import { escapeRegex, isDuplicate } from '../util.js';
import { assertGstRate, customerFields, saveCustomer } from './catalog.js';
import { readDataUrl } from './files.js';
import { allocateInvoiceNumber } from './numbering.js';

function asDomain(error: unknown): never {
  if (error instanceof DomainError) throw new HttpError(400, error.message);
  throw error;
}

async function loadContext(businessId: string) {
  const [business, settings] = await Promise.all([
    Business.findById(businessId),
    BusinessSettings.findOne({ businessId }),
  ]);
  if (!business || !settings) throw new HttpError(409, 'Add your business profile to continue.');
  return { business, settings };
}

async function resolveCustomer(businessId: string, input: InvoiceInput, existing?: { customerId?: unknown; customerSnapshot?: unknown }) {
  if (input.newCustomer) {
    const created = await saveCustomer(businessId, input.newCustomer);
    return created;
  }
  if (input.customerId) {
    const same = existing && String(existing.customerId || '') === input.customerId && !input.refreshCustomer;
    if (same) return null;
    const customer = await Customer.findOne({ _id: input.customerId, businessId });
    if (!customer || customer.archived) throw new HttpError(400, 'Choose a customer from your list.');
    return customer;
  }
  return null;
}

function snapshotCustomer(customer: {
  _id: unknown;
  name: string;
  mobile?: string;
  email?: string;
  gstin?: string;
  state?: string;
  stateCode?: string;
  billingAddress?: object;
  shippingAddress?: object | null;
  sameAsBilling?: boolean;
}) {
  return {
    customerId: customer._id,
    name: customer.name,
    mobile: customer.mobile || '',
    email: customer.email || '',
    gstin: customer.gstin || '',
    state: customer.state || '',
    stateCode: customer.stateCode || '',
    billingAddress: customer.billingAddress || {},
    shippingAddress: customer.sameAsBilling ? null : customer.shippingAddress || null,
  };
}

async function sellerSnapshot(business: Awaited<ReturnType<typeof loadContext>>['business'], settings: Awaited<ReturnType<typeof loadContext>>['settings']) {
  const gst = Boolean(business.gstin);
  return {
    name: business.name,
    ownerName: business.ownerName,
    mobile: business.mobile,
    email: business.email,
    address: business.address,
    gstin: business.gstin || '',
    pan: business.pan || '',
    state: business.state,
    stateCode: business.stateCode,
    pincode: business.pincode,
    logoDataUrl: await readDataUrl(business.logoPath || ''),
    signatureDataUrl: await readDataUrl(business.signaturePath || ''),
    bank: business.bank?.bankName ? business.bank : null,
    upiId: business.upiId || '',
    signatory: settings.defaults.signatory || business.ownerName,
    documentTitle: gst ? settings.defaults.documentTitleGst || 'Tax Invoice' : settings.defaults.documentTitlePlain || 'Invoice',
    footer: settings.defaults.footer || '',
  };
}

async function prepareCalculation(businessId: string, input: InvoiceInput, frozen?: {
  isGstInvoice: boolean;
  priceMode: 'exclusive' | 'inclusive';
  roundOffMode: 'nearest_rupee' | 'none';
  sellerStateCode: string;
  priorRates?: number[];
}) {
  const { business, settings } = await loadContext(businessId);
  const gstApplicable = frozen ? frozen.isGstInvoice : Boolean(business.gstin);
  const priceMode = frozen?.priceMode ?? (settings.defaults.priceMode as 'exclusive' | 'inclusive');
  const roundOff = frozen?.roundOffMode ?? (settings.defaults.roundOff as 'nearest_rupee' | 'none');
  const sellerState = frozen?.sellerStateCode || business.stateCode;
  let placeCode = input.placeOfSupplyStateCode;
  if (!placeCode) placeCode = sellerState;
  const place = placeCode ? findState(placeCode) : undefined;
  if (input.status !== 'draft' && !place) throw new HttpError(400, 'Choose a place of supply.');
  const prior = new Set((frozen?.priorRates || []).map((rate) => roundRate(rate)));
  const lines = [];
  for (const item of input.items) {
    let gstRate = item.gstRate ?? 0;
    if (gstApplicable) {
      gstRate = prior.has(roundRate(gstRate)) ? roundRate(gstRate) : await assertGstRate(businessId, gstRate);
    }
    if (item.productId) {
      const product = await Product.findOne({ _id: item.productId, businessId });
      if (!product) throw new HttpError(400, `“${item.name}” is not in your product list.`);
    }
    lines.push({ ...item, gstRate });
  }
  let totals: InvoiceTotals;
  try {
    totals = calculateInvoice({
      lines: lines.map((line) => ({
        quantity: line.quantity,
        rate: line.rate,
        discountMode: line.discountMode,
        discountValue: line.discountValue,
        gstRate: line.gstRate,
        hsnSac: line.hsnSac,
      })),
      invoiceDiscountMode: input.invoiceDiscountMode,
      invoiceDiscountValue: input.invoiceDiscountValue,
      gstApplicable,
      sellerStateCode: sellerState,
      placeOfSupplyStateCode: place?.code || sellerState,
      roundOff,
      priceMode,
    });
  } catch (error) {
    asDomain(error);
  }
  return { business, settings, totals: totals!, place, gstApplicable, priceMode, roundOff, lines };
}

function itemsFrom(lines: Awaited<ReturnType<typeof prepareCalculation>>['lines'], totals: InvoiceTotals) {
  return lines.map((line, index) => {
    const calc = totals.lines[index];
    return {
      productId: line.productId || null,
      name: line.name,
      sku: line.sku || '',
      hsnSac: line.hsnSac || '',
      description: line.description || '',
      unit: line.unit || 'pcs',
      quantity: calc.quantity,
      rate: calc.rate,
      discountMode: calc.discountMode,
      discountValue: calc.discountValue,
      grossAmount: calc.grossAmount,
      discountAmount: calc.discountAmount,
      invoiceDiscountShare: calc.invoiceDiscountShare,
      taxableAmount: calc.taxableAmount,
      gstRate: calc.gstRate,
      cgst: calc.cgst,
      sgst: calc.sgst,
      igst: calc.igst,
      taxAmount: calc.taxAmount,
      total: calc.total,
    };
  });
}

async function assertUniqueNumber(businessId: string, number: string, exceptId?: string) {
  const existing = await Invoice.findOne({
    businessId,
    number: { $regex: `^${escapeRegex(number)}$`, $options: 'i' },
    ...(exceptId ? { _id: { $ne: exceptId } } : {}),
  });
  if (existing) throw new HttpError(409, `Invoice number ${number} is already used.`);
}

async function claimNumber(businessId: string, invoiceDate: string, requested: string) {
  if (requested) {
    if (!isValidInvoiceNumber(requested)) {
      throw new HttpError(400, 'Invoice numbers can use letters, numbers, and - / _ .');
    }
    await assertUniqueNumber(businessId, requested);
    let financialYear = '';
    try {
      financialYear = (await import('../domain/dates.js')).financialYear(invoiceDate).label;
    } catch (error) {
      asDomain(error);
    }
    return { number: requested, sequence: 0, financialYear };
  }
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const issued = await allocateInvoiceNumber(businessId, invoiceDate);
    const exists = await Invoice.exists({ businessId, number: issued.number });
    if (!exists) return issued;
  }
  throw new HttpError(409, 'Could not allocate a unique invoice number. Check numbering in Settings.');
}

async function adjustStock(businessId: string, items: { productId?: unknown; quantity: number }[], sign: 1 | -1) {
  for (const item of items) {
    if (!item.productId) continue;
    const product = await Product.findOne({ _id: item.productId, businessId });
    if (!product?.trackStock) continue;
    const next = Math.round(((product.stockQuantity ?? 0) + sign * item.quantity) * 1000) / 1000;
    product.stockQuantity = next;
    await product.save();
  }
}

async function stockWarnings(businessId: string, items: { productId?: unknown }[]) {
  const ids = items.map((item) => item.productId).filter(Boolean);
  if (!ids.length) return [];
  const products = await Product.find({ _id: { $in: ids }, businessId, trackStock: true });
  return products.flatMap((product) => {
    const qty = product.stockQuantity ?? 0;
    if (qty < 0) return [`${product.name} is now ${qty} ${product.unit} in stock.`];
    if (qty <= (product.lowStockThreshold ?? 5)) return [`${product.name} is low on stock (${qty} ${product.unit}).`];
    return [];
  });
}

async function refreshPayments(invoice: InstanceType<typeof Invoice>) {
  const payments = await Payment.find({ invoiceId: invoice._id });
  const paid = payments.reduce((sum, payment) => sum + toPaise(payment.amount), 0);
  const total = toPaise(invoice.totals.grandTotal);
  invoice.amountPaid = fromPaise(paid);
  if (invoice.status === 'cancelled') {
    invoice.amountDue = 0;
  } else if (invoice.status === 'draft') {
    invoice.amountDue = fromPaise(Math.max(0, total - paid));
  } else if (paid <= 0) {
    invoice.amountDue = fromPaise(total);
    invoice.status = total === 0 ? 'paid' : 'unpaid';
  } else if (paid < total) {
    invoice.amountDue = fromPaise(total - paid);
    invoice.status = 'partial';
  } else {
    invoice.amountDue = 0;
    invoice.status = 'paid';
  }
  await invoice.save();
}

export async function recordPayment(
  businessId: string,
  input: { invoiceId: string; amount: number; method: PaymentMethod; reference?: string; notes?: string; paidAt?: string },
) {
  const { settings } = await loadContext(businessId);
  const invoice = await Invoice.findOne({ _id: input.invoiceId, businessId });
  if (!invoice) throw new HttpError(404, 'Invoice not found.');
  if (invoice.status === 'cancelled') throw new HttpError(400, 'Cancelled invoices cannot take a payment.');
  if (invoice.status === 'draft') throw new HttpError(400, 'Issue the invoice before recording a payment.');
  const amount = toPaise(input.amount);
  const due = toPaise(invoice.amountDue);
  if (amount <= 0) throw new HttpError(400, 'Enter an amount greater than zero.');
  if (amount > due) throw new HttpError(400, `That is more than the balance of ${formatInr(invoice.amountDue)}.`);
  const paidAt = input.paidAt || todayKey(settings.defaults.timezone);
  try {
    parseDateKey(paidAt);
  } catch (error) {
    asDomain(error);
  }
  await Payment.create({
    businessId,
    invoiceId: invoice._id,
    amount: fromPaise(amount),
    method: input.method,
    reference: input.reference || '',
    notes: input.notes || '',
    paidAtKey: paidAt,
  });
  await refreshPayments(invoice);
  return detail(businessId, String(invoice._id));
}

async function detail(businessId: string, invoiceId: string) {
  const invoice = await Invoice.findOne({ _id: invoiceId, businessId });
  if (!invoice) throw new HttpError(404, 'Invoice not found.');
  const payments = await Payment.find({ businessId, invoiceId: invoice._id }).sort({ paidAtKey: 1, createdAt: 1 });
  return presentInvoiceDetail(invoice, payments);
}

function paymentPlan(input: InvoiceInput, grandTotal: number) {
  if (input.status === 'draft' || input.status === 'unpaid') return null;
  const payment = input.initialPayment;
  if (toPaise(grandTotal) === 0) return null;
  if (input.status === 'partial') {
    if (!payment) throw new HttpError(400, 'Enter the amount received so far.');
    return payment;
  }
  if (payment && toPaise(payment.amount) !== toPaise(grandTotal)) {
    throw new HttpError(400, 'A paid invoice needs the full amount, or mark it partially paid.');
  }
  return (
    payment ?? {
      amount: grandTotal,
      method: 'cash' as const,
      reference: '',
      notes: '',
      paidAt: input.invoiceDate,
    }
  );
}

export async function createInvoice(businessId: string, input: InvoiceInput) {
  try {
    parseDateKey(input.invoiceDate);
    if (input.dueDate) parseDateKey(input.dueDate);
  } catch (error) {
    asDomain(error);
  }
  const prepared = await prepareCalculation(businessId, input);
  const customerDoc = await resolveCustomer(businessId, input);
  if (input.status !== 'draft' && !customerDoc) throw new HttpError(400, 'Choose a customer.');
  const place = prepared.place ?? findState(prepared.business.stateCode);
  const { settings } = prepared;
  const dueDate =
    input.dueDate ||
    (input.status === 'draft' ? '' : addDays(input.invoiceDate, Math.min(365, Math.max(0, settings.defaults.paymentTermsDays || 0))));
  const numbered = await claimNumber(businessId, input.invoiceDate, input.number || '');
  const items = itemsFrom(prepared.lines, prepared.totals);
  const grand = prepared.totals.grandTotal;
  let status: InvoiceStatus = input.status;
  if (status !== 'draft' && toPaise(grand) === 0) status = 'paid';
  const payment = paymentPlan({ ...input, status }, grand);
  const customerSnapshot = customerDoc
    ? snapshotCustomer(customerDoc)
    : { customerId: null, name: '', mobile: '', email: '', gstin: '', state: '', stateCode: '', billingAddress: {}, shippingAddress: null };
  const invoice = await Invoice.create({
    businessId,
    number: numbered.number,
    sequence: numbered.sequence,
    financialYear: numbered.financialYear,
    status: status === 'draft' ? 'draft' : 'unpaid',
    invoiceDateKey: input.invoiceDate,
    dueDateKey: dueDate,
    placeOfSupply: { state: place?.name || '', stateCode: place?.code || '' },
    supplyType: prepared.totals.supplyType,
    isGstInvoice: prepared.gstApplicable,
    priceMode: prepared.priceMode,
    roundOffMode: prepared.roundOff,
    template: settings.defaults.template,
    customerId: customerDoc?._id ?? null,
    sellerSnapshot: await sellerSnapshot(prepared.business, settings),
    customerSnapshot,
    items,
    invoiceDiscountMode: input.invoiceDiscountMode,
    invoiceDiscountValue: input.invoiceDiscountValue,
    totals: {
      subtotal: prepared.totals.subtotal,
      itemDiscount: prepared.totals.itemDiscount,
      invoiceDiscount: prepared.totals.invoiceDiscount,
      taxableAmount: prepared.totals.taxableAmount,
      cgst: prepared.totals.cgst,
      sgst: prepared.totals.sgst,
      igst: prepared.totals.igst,
      taxAmount: prepared.totals.taxAmount,
      roundOff: prepared.totals.roundOff,
      grandTotal: grand,
    },
    amountPaid: 0,
    amountDue: grand,
    notes: input.notes === undefined ? settings.defaults.notes || '' : input.notes,
    terms: input.terms === undefined ? settings.defaults.terms || '' : input.terms,
    footer: input.footer === undefined ? settings.defaults.footer || '' : input.footer,
    shareToken: crypto.randomBytes(24).toString('hex'),
  }).catch((error) => {
    if (isDuplicate(error)) throw new HttpError(409, 'That invoice number is already used.');
    throw error;
  });
  if (isIssued(invoice.status)) await adjustStock(businessId, items, -1);
  if (payment && isIssued(invoice.status)) {
    await recordPayment(businessId, {
      invoiceId: String(invoice._id),
      amount: payment.amount,
      method: payment.method,
      reference: payment.reference,
      notes: payment.notes,
      paidAt: payment.paidAt || input.invoiceDate,
    });
  } else if (invoice.status !== 'draft' && toPaise(grand) === 0) {
    invoice.status = 'paid';
    invoice.amountDue = 0;
    await invoice.save();
  }
  const warnings = isIssued(status) ? await stockWarnings(businessId, items) : [];
  return { invoice: await detail(businessId, String(invoice._id)), warnings };
}

export async function updateInvoice(businessId: string, invoiceId: string, input: InvoiceInput) {
  const invoice = await Invoice.findOne({ _id: invoiceId, businessId });
  if (!invoice) throw new HttpError(404, 'Invoice not found.');
  if (invoice.status === 'cancelled') throw new HttpError(400, 'Cancelled invoices stay as they were issued.');
  try {
    parseDateKey(input.invoiceDate);
    if (input.dueDate) parseDateKey(input.dueDate);
  } catch (error) {
    asDomain(error);
  }
  const prepared = await prepareCalculation(businessId, input, {
    isGstInvoice: invoice.isGstInvoice,
    priceMode: invoice.priceMode as 'exclusive' | 'inclusive',
    roundOffMode: invoice.roundOffMode as 'nearest_rupee' | 'none',
    sellerStateCode: invoice.sellerSnapshot.stateCode || '',
    priorRates: invoice.items.map((item) => item.gstRate),
  });
  const customerDoc = await resolveCustomer(businessId, input, invoice);
  if (input.status !== 'draft' && !customerDoc && !invoice.customerSnapshot?.name && !input.customerId) {
    throw new HttpError(400, 'Choose a customer.');
  }
  if (input.number && input.number !== invoice.number) {
    if (!isValidInvoiceNumber(input.number)) throw new HttpError(400, 'Invoice numbers can use letters, numbers, and - / _ .');
    await assertUniqueNumber(businessId, input.number, String(invoice._id));
    invoice.number = input.number;
  }
  const items = itemsFrom(prepared.lines, prepared.totals);
  const grand = prepared.totals.grandTotal;
  if (isIssued(invoice.status) && toPaise(grand) < toPaise(invoice.amountPaid)) {
    throw new HttpError(400, `The new total is less than ${formatInr(invoice.amountPaid)} already received.`);
  }
  const wasIssued = isIssued(invoice.status);
  const previousItems = invoice.items.map((item) => ({ productId: item.productId, quantity: item.quantity }));
  const nextStatus: InvoiceStatus = invoice.status === 'draft' ? (input.status === 'draft' ? 'draft' : 'unpaid') : invoice.status;
  const place = prepared.place ?? { name: invoice.placeOfSupply.state, code: invoice.placeOfSupply.stateCode };
  invoice.invoiceDateKey = input.invoiceDate;
  invoice.dueDateKey =
    input.dueDate ||
    invoice.dueDateKey ||
    (nextStatus === 'draft' ? '' : addDays(input.invoiceDate, prepared.settings.defaults.paymentTermsDays || 0));
  invoice.placeOfSupply = { state: place?.name || '', stateCode: place?.code || '' };
  invoice.supplyType = prepared.totals.supplyType;
  invoice.items = items as never;
  invoice.invoiceDiscountMode = input.invoiceDiscountMode;
  invoice.invoiceDiscountValue = input.invoiceDiscountValue;
  invoice.totals = {
    subtotal: prepared.totals.subtotal,
    itemDiscount: prepared.totals.itemDiscount,
    invoiceDiscount: prepared.totals.invoiceDiscount,
    taxableAmount: prepared.totals.taxableAmount,
    cgst: prepared.totals.cgst,
    sgst: prepared.totals.sgst,
    igst: prepared.totals.igst,
    taxAmount: prepared.totals.taxAmount,
    roundOff: prepared.totals.roundOff,
    grandTotal: grand,
  };
  if (input.notes !== undefined) invoice.notes = input.notes;
  if (input.terms !== undefined) invoice.terms = input.terms;
  if (input.footer !== undefined) invoice.footer = input.footer;
  if (customerDoc) {
    invoice.customerId = customerDoc._id;
    invoice.customerSnapshot = snapshotCustomer(customerDoc) as never;
  }
  invoice.status = nextStatus === 'draft' ? 'draft' : invoice.status === 'draft' ? 'unpaid' : invoice.status;
  invoice.amountDue = fromPaise(Math.max(0, toPaise(grand) - toPaise(invoice.amountPaid)));
  try {
    await invoice.save();
  } catch (error) {
    if (isDuplicate(error)) throw new HttpError(409, 'That invoice number is already used.');
    throw error;
  }
  if (invoice.status !== 'draft') await refreshPayments(invoice);
  if (wasIssued) await adjustStock(businessId, previousItems, +1);
  if (isIssued(invoice.status)) await adjustStock(businessId, items, -1);
  const warnings = isIssued(invoice.status) ? await stockWarnings(businessId, items) : [];
  return { invoice: await detail(businessId, String(invoice._id)), warnings };
}

export async function getInvoiceDetail(businessId: string, invoiceId: string) {
  return detail(businessId, invoiceId);
}

export async function cancelInvoice(businessId: string, invoiceId: string, reason: string) {
  const invoice = await Invoice.findOne({ _id: invoiceId, businessId });
  if (!invoice) throw new HttpError(404, 'Invoice not found.');
  if (invoice.status === 'cancelled') throw new HttpError(400, 'This invoice is already cancelled.');
  if (invoice.status === 'draft') throw new HttpError(400, 'Delete the draft instead of cancelling it.');
  const payments = await Payment.countDocuments({ invoiceId: invoice._id });
  const items = invoice.items.map((item) => ({ productId: item.productId, quantity: item.quantity }));
  invoice.status = 'cancelled';
  invoice.cancelReason = reason || '';
  invoice.amountDue = 0;
  await invoice.save();
  await adjustStock(businessId, items, +1);
  const warnings = payments
    ? ['Payments already recorded on this invoice stay in the payment list. It is no longer included in sales.']
    : [];
  return { invoice: await detail(businessId, invoiceId), warnings };
}

export async function deleteDraft(businessId: string, invoiceId: string) {
  const invoice = await Invoice.findOne({ _id: invoiceId, businessId });
  if (!invoice) throw new HttpError(404, 'Invoice not found.');
  if (invoice.status !== 'draft') throw new HttpError(400, 'Only drafts can be deleted. Cancel an issued invoice instead.');
  await invoice.deleteOne();
}

export async function rotateShareToken(businessId: string, invoiceId: string) {
  const invoice = await Invoice.findOne({ _id: invoiceId, businessId });
  if (!invoice) throw new HttpError(404, 'Invoice not found.');
  invoice.shareToken = crypto.randomBytes(24).toString('hex');
  await invoice.save();
  return { shareToken: invoice.shareToken, sharePath: `/share/${invoice.shareToken}` };
}

export async function previewInvoiceHtml(businessId: string, input: InvoiceInput, invoiceId?: string) {
  const existing = invoiceId ? await Invoice.findOne({ _id: invoiceId, businessId }) : null;
  if (invoiceId && !existing) throw new HttpError(404, 'Invoice not found.');
  const prepared = await prepareCalculation(
    businessId,
    { ...input, status: input.items.length ? input.status : 'draft' },
    existing
      ? {
          isGstInvoice: existing.isGstInvoice,
          priceMode: existing.priceMode as 'exclusive' | 'inclusive',
          roundOffMode: existing.roundOffMode as 'nearest_rupee' | 'none',
          sellerStateCode: existing.sellerSnapshot.stateCode || '',
          priorRates: existing.items.map((item) => item.gstRate),
        }
      : undefined,
  );
  const customerSnapshot = input.newCustomer
    ? snapshotCustomer({ _id: null, ...customerFields(input.newCustomer) })
    : await (async () => {
        const customerDoc = await resolveCustomer(businessId, { ...input, newCustomer: undefined }, existing ?? undefined);
        if (customerDoc) return snapshotCustomer(customerDoc);
        return (
          existing?.customerSnapshot || {
            name: 'Customer',
            mobile: '',
            email: '',
            gstin: '',
            state: '',
            stateCode: '',
            billingAddress: {},
            shippingAddress: null as null,
          }
        );
      })();
  const place = prepared.place ?? findState(prepared.business.stateCode);
  const items = itemsFrom(prepared.lines, prepared.totals);
  const seller = existing ? existing.sellerSnapshot : await sellerSnapshot(prepared.business, prepared.settings);
  const transient = {
    number: input.number || existing?.number || 'PREVIEW',
    status: existing?.status || input.status || 'unpaid',
    invoiceDateKey: input.invoiceDate,
    dueDateKey: input.dueDate || '',
    placeOfSupply: { state: place?.name || '', stateCode: place?.code || '' },
    supplyType: prepared.totals.supplyType,
    isGstInvoice: prepared.gstApplicable,
    template: existing?.template || prepared.settings.defaults.template,
    notes: input.notes ?? existing?.notes ?? prepared.settings.defaults.notes ?? '',
    terms: input.terms ?? existing?.terms ?? prepared.settings.defaults.terms ?? '',
    footer: input.footer ?? existing?.footer ?? prepared.settings.defaults.footer ?? '',
    sellerSnapshot: seller,
    customerSnapshot,
    items,
    totals: {
      taxableAmount: prepared.totals.taxableAmount,
      itemDiscount: prepared.totals.itemDiscount,
      invoiceDiscount: prepared.totals.invoiceDiscount,
      cgst: prepared.totals.cgst,
      sgst: prepared.totals.sgst,
      igst: prepared.totals.igst,
      roundOff: prepared.totals.roundOff,
      grandTotal: prepared.totals.grandTotal,
    },
    amountPaid: existing?.amountPaid ?? 0,
    amountDue: existing ? fromPaise(Math.max(0, toPaise(prepared.totals.grandTotal) - toPaise(existing.amountPaid))) : prepared.totals.grandTotal,
    cancelReason: '',
  };
  const { toInvoiceView } = await import('./invoiceView.js');
  const { renderInvoiceHtml } = await import('./invoiceHtml.js');
  return renderInvoiceHtml(toInvoiceView(transient));
}

export async function renderStoredInvoice(invoice: InstanceType<typeof Invoice>, autoPrint = false) {
  const { toInvoiceView } = await import('./invoiceView.js');
  const { renderInvoiceHtml } = await import('./invoiceHtml.js');
  return renderInvoiceHtml(toInvoiceView(invoice), { autoPrint });
}
