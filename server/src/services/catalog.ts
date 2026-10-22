import { DEFAULT_TAX_RATES, DEFAULT_TERMS } from '../domain/constants.js';
import { financialYear, todayKey } from '../domain/dates.js';
import { DomainError } from '../domain/errors.js';
import { normalizeMobile, validateGstin, validateIfsc, validatePan, validateUpi } from '../domain/gstin.js';
import { roundRate } from '../domain/money.js';
import { findState } from '../domain/states.js';
import { safeTimeZone } from '../domain/dates.js';
import { HttpError } from '../http.js';
import { Business, BusinessSettings, Customer, Invoice, Product, TaxRate, User } from '../models.js';
import type { BusinessInput, CustomerInput, ProductInput, SettingsInput } from '../schemas.js';
import { isDuplicate } from '../util.js';

function rejected(result: { ok: boolean; message?: string }): string | null {
  return result.ok ? null : result.message || 'Check this value.';
}

function httpFromDomain(error: unknown): never {
  if (error instanceof DomainError) throw new HttpError(400, error.message);
  throw error;
}

function requireState(code: string) {
  const state = findState(code);
  if (!state) throw new HttpError(400, 'Choose a state from the list.');
  return state;
}

function cleanEmail(email: string): string {
  const value = email.trim();
  if (!value) return '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new HttpError(400, 'Enter a valid email, or leave it blank.');
  return value;
}

function cleanMobile(mobile: string, required: boolean): string {
  const value = normalizeMobile(mobile || '');
  if (value === null || (required && !value)) {
    throw new HttpError(400, required ? 'Enter a 10-digit mobile number.' : 'Enter a 10-digit mobile number, or leave it blank.');
  }
  return value;
}

function cleanPin(pincode: string, required: boolean): string {
  const value = pincode.trim();
  if (!value && !required) return '';
  if (!/^[1-9][0-9]{5}$/.test(value)) throw new HttpError(400, 'Pincode should be 6 digits.');
  return value;
}

export async function assertGstRate(businessId: string, rate: number, extra: number[] = []): Promise<number> {
  const normalized = roundRate(rate);
  const rows = await TaxRate.find({ businessId, active: true });
  const allowed = new Set(rows.map((row) => roundRate(row.rate)));
  for (const value of extra) allowed.add(roundRate(value));
  if (!allowed.has(normalized)) {
    throw new HttpError(
      400,
      `GST ${normalized}% is not in your active tax rates. Add it under Settings → Tax, or pick a rate that is already there.`,
    );
  }
  return normalized;
}

export function customerFields(input: CustomerInput) {
  const state = requireState(input.stateCode);
  let gstin = '';
  if (input.gstin?.trim()) {
    const result = validateGstin(input.gstin, { expectedStateCode: state.code });
    const gstinError = rejected(result);
    if (gstinError) throw new HttpError(400, gstinError);
    gstin = (result as { gstin: string }).gstin;
  }
  const billingPin = cleanPin(input.billingAddress?.pincode || '', false);
  const billing = {
    line1: input.billingAddress?.line1?.trim() || '',
    line2: input.billingAddress?.line2?.trim() || '',
    city: input.billingAddress?.city?.trim() || '',
    state: state.name,
    stateCode: state.code,
    pincode: billingPin,
  };
  let shipping: typeof billing | null = null;
  if (!input.sameAsBilling && input.shippingAddress) {
    const shipState = requireState(input.shippingAddress.stateCode || state.code);
    shipping = {
      line1: input.shippingAddress.line1?.trim() || '',
      line2: input.shippingAddress.line2?.trim() || '',
      city: input.shippingAddress.city?.trim() || '',
      state: shipState.name,
      stateCode: shipState.code,
      pincode: cleanPin(input.shippingAddress.pincode || '', false),
    };
  }
  return {
    name: input.name.trim(),
    mobile: cleanMobile(input.mobile || '', false),
    email: cleanEmail(input.email || ''),
    gstin,
    state: state.name,
    stateCode: state.code,
    billingAddress: billing,
    shippingAddress: shipping,
    sameAsBilling: !shipping,
  };
}

export async function saveCustomer(businessId: string, input: CustomerInput, customerId?: string) {
  const payload = customerFields(input);
  if (customerId) {
    const customer = await Customer.findOneAndUpdate(
      { _id: customerId, businessId, archived: { $ne: true } },
      payload,
      { new: true },
    );
    if (!customer) throw new HttpError(404, 'Customer not found.');
    return customer;
  }
  return Customer.create({ businessId, ...payload });
}

export async function saveProduct(businessId: string, input: ProductInput, productId?: string) {
  const gstRate = await assertGstRate(businessId, input.gstRate);
  const specs = (input.specifications || [])
    .map((row) => ({ label: row.label.trim(), value: row.value.trim() }))
    .filter((row) => row.label && row.value);
  const payload = {
    name: input.name.trim(),
    sku: input.sku?.trim() || '',
    hsnSac: input.hsnSac?.trim() || '',
    category: input.category?.trim() || '',
    subCategory: input.subCategory?.trim() || '',
    brand: input.brand?.trim() || '',
    unit: input.unit?.trim() || 'pcs',
    sellingPrice: roundRate(input.sellingPrice),
    purchasePrice: input.purchasePrice == null ? null : roundRate(input.purchasePrice),
    wholesalePrice: input.wholesalePrice == null ? null : roundRate(input.wholesalePrice),
    gstRate,
    trackStock: Boolean(input.trackStock),
    lowStockThreshold: input.lowStockThreshold ?? 5,
    description: input.description?.trim() || '',
    specifications: specs,
    status: input.status || 'active',
  };
  try {
    if (productId) {
      const existing = await Product.findOne({ _id: productId, businessId, archived: { $ne: true } });
      if (!existing) throw new HttpError(404, 'Product not found.');
      const previous = existing.stockQuantity ?? 0;
      Object.assign(existing, payload);
      if (!payload.trackStock) existing.stockQuantity = null;
      await existing.save();
      if (payload.trackStock && input.stockQuantity != null) {
        const delta = Math.round((input.stockQuantity - previous) * 1000) / 1000;
        if (delta !== 0) {
          const { commitStock } = await import('./stock.js');
          const { todayKey } = await import('../domain/dates.js');
          await commitStock(businessId, [
            {
              productId,
              quantity: Math.abs(delta),
              direction: delta > 0 ? 'in' : 'out',
              type: 'adjustment',
              reference: 'Stock edit',
              dateKey: todayKey('Asia/Kolkata'),
            },
          ]);
        }
      }
      return Product.findById(existing._id);
    }
    const opening = payload.trackStock ? input.stockQuantity ?? 0 : null;
    const created = await Product.create({ businessId, ...payload, stockQuantity: opening });
    if (payload.trackStock && (opening || 0) > 0) {
      const { noteOpening } = await import('./stock.js');
      await noteOpening(businessId, String(created._id), opening || 0);
    }
    return created;
  } catch (error) {
    if (isDuplicate(error)) throw new HttpError(409, 'That SKU is already used.');
    throw error;
  }
}

export async function saveBusiness(userId: string, input: BusinessInput) {
  const user = await User.findById(userId);
  if (!user) throw new HttpError(401, 'Sign in to continue.');
  const state = requireState(input.stateCode);
  let pan = '';
  if (input.pan?.trim()) {
    const result = validatePan(input.pan);
    const panError = rejected(result);
    if (panError) throw new HttpError(400, panError);
    pan = (result as { pan: string }).pan;
  }
  let gstin = '';
  if (input.gstin?.trim()) {
    const result = validateGstin(input.gstin, { expectedStateCode: state.code, expectedPan: pan });
    const gstinError = rejected(result);
    if (gstinError) throw new HttpError(400, gstinError);
    gstin = (result as { gstin: string }).gstin;
  }
  let upiId = '';
  if (input.upiId?.trim()) {
    const result = validateUpi(input.upiId);
    const upiError = rejected(result);
    if (upiError) throw new HttpError(400, upiError);
    upiId = (result as { upiId: string }).upiId;
  }
  let bank: { bankName: string; accountName: string; accountNumber: string; ifsc: string } | null = null;
  if (input.bank && (input.bank.bankName || input.bank.accountNumber || input.bank.ifsc || input.bank.accountName)) {
    if (!input.bank.bankName || !input.bank.accountName || !input.bank.accountNumber || !input.bank.ifsc) {
      throw new HttpError(400, 'Enter the bank name, account name, account number, and IFSC, or leave bank details blank.');
    }
    const ifsc = validateIfsc(input.bank.ifsc);
    const ifscError = rejected(ifsc);
    if (ifscError) throw new HttpError(400, ifscError);
    bank = {
      bankName: input.bank.bankName.trim(),
      accountName: input.bank.accountName.trim(),
      accountNumber: input.bank.accountNumber.trim(),
      ifsc: (ifsc as { ifsc: string }).ifsc,
    };
  }
  const email = cleanEmail(input.email || '');
  const fields = {
    name: input.name.trim(),
    ownerName: input.ownerName.trim(),
    mobile: cleanMobile(input.mobile, true),
    email,
    address: {
      line1: input.addressLine1.trim(),
      line2: input.addressLine2?.trim() || '',
      city: input.city.trim(),
      state: state.name,
      stateCode: state.code,
      pincode: input.pincode,
    },
    gstin,
    pan,
    state: state.name,
    stateCode: state.code,
    pincode: input.pincode,
    bank,
    upiId,
  };
  let business = user.businessId ? await Business.findOne({ _id: user.businessId, ownerId: user._id }) : null;
  const creating = !business;
  if (!business) {
    business = await Business.create({ ownerId: user._id, ...fields });
    user.businessId = business._id;
    await user.save();
    let fyYear = new Date().getFullYear();
    try {
      fyYear = financialYear(todayKey('Asia/Kolkata'), 4).startYear;
    } catch (error) {
      httpFromDomain(error);
    }
    await BusinessSettings.create({
      businessId: business._id,
      invoice: {
        prefix: 'INV',
        separator: '-',
        padLength: 4,
        startingNumber: 1,
        nextNumber: 1,
        includeFinancialYear: true,
        fyStyle: 'start_year',
        fyStartMonth: 4,
        resetEachFinancialYear: true,
        currentFyStartYear: fyYear,
        lastAllocated: 0,
      },
      defaults: {
        paymentTermsDays: 15,
        notes: '',
        terms: DEFAULT_TERMS,
        footer: 'Thank you for your business.',
        roundOff: 'nearest_rupee',
        priceMode: 'exclusive',
        template: 'classic',
        timezone: 'Asia/Kolkata',
        documentTitleGst: 'Tax Invoice',
        documentTitlePlain: 'Invoice',
        signatory: fields.ownerName,
        lowStockThreshold: 5,
      },
    });
    await TaxRate.insertMany(
      DEFAULT_TAX_RATES.map((rate) => ({
        businessId: business!._id,
        rate,
        name: rate === 0 ? 'Nil / exempt (0%)' : `GST ${rate}%`,
        active: true,
      })),
    );
  } else {
    Object.assign(business, fields);
    await business.save();
    await BusinessSettings.updateOne(
      { businessId: business._id, 'defaults.signatory': '' },
      { $set: { 'defaults.signatory': fields.ownerName } },
    );
  }
  const settings = await BusinessSettings.findOne({ businessId: business._id });
  return { business, settings };
}

export async function saveSettings(businessId: string, input: SettingsInput) {
  const settings = await BusinessSettings.findOne({ businessId });
  if (!settings) throw new HttpError(404, 'Business settings were not found.');
  if (input.invoice) {
    const max = await Invoice.findOne({ businessId, sequence: { $gt: 0 } }).sort({ sequence: -1 });
    const floor = (max?.sequence ?? 0) + 1;
    settings.invoice.prefix = input.invoice.prefix;
    settings.invoice.separator = input.invoice.separator;
    settings.invoice.padLength = input.invoice.padLength;
    settings.invoice.startingNumber = input.invoice.startingNumber;
    settings.invoice.nextNumber = Math.max(input.invoice.startingNumber, floor);
    settings.invoice.includeFinancialYear = input.invoice.includeFinancialYear;
    settings.invoice.fyStyle = input.invoice.fyStyle;
    settings.invoice.fyStartMonth = input.invoice.fyStartMonth;
    settings.invoice.resetEachFinancialYear = input.invoice.resetEachFinancialYear;
  }
  if (input.defaults) {
    if (safeTimeZone(input.defaults.timezone) !== input.defaults.timezone) {
      throw new HttpError(400, 'Choose a valid timezone, such as Asia/Kolkata.');
    }
    settings.defaults = { ...settings.defaults, ...input.defaults };
  }
  if (input.inventory) settings.set('inventory', { allowNegativeStock: false, lowStockThreshold: 5, valuation: 'purchase', ...(settings.inventory || {}), ...input.inventory });
  if (input.catalog) settings.set('catalog', { showRetail: true, showWholesale: true, showGst: false, layout: 'grid', perPage: 6, ...(settings.catalog || {}), ...input.catalog });
  if (input.documents) settings.set('documents', { maxUploadMb: 8, allowedTypes: ['pdf', 'jpg', 'jpeg', 'png'], ...(settings.documents || {}), ...input.documents });
  await settings.save();
  return settings;
}
