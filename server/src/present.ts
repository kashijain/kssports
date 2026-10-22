import { amountInWords } from './domain/words.js';
import { methodLabel, statusLabel } from './domain/constants.js';
import { fromPaise, toPaise } from './domain/money.js';

type Loose = Record<string, any>;

export function presentUser(user: Loose) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    hasBusiness: Boolean(user.businessId),
  };
}

export function presentBusiness(business: Loose) {
  return {
    id: String(business._id),
    name: business.name,
    ownerName: business.ownerName,
    mobile: business.mobile || '',
    email: business.email || '',
    address: business.address || {},
    gstin: business.gstin || '',
    pan: business.pan || '',
    state: business.state || '',
    stateCode: business.stateCode || '',
    pincode: business.pincode || '',
    logoUrl: business.logoPath ? `/uploads/${business.logoPath}` : '/logo.png',
    signatureUrl: business.signaturePath ? `/uploads/${business.signaturePath}` : '',
    bank: business.bank?.bankName ? business.bank : null,
    upiId: business.upiId || '',
    gstEnabled: Boolean(business.gstin),
  };
}

export function presentSettings(settings: Loose) {
  return {
    invoice: {
      prefix: settings.invoice.prefix,
      separator: settings.invoice.separator,
      padLength: settings.invoice.padLength,
      startingNumber: settings.invoice.startingNumber,
      nextNumber: settings.invoice.nextNumber,
      includeFinancialYear: settings.invoice.includeFinancialYear,
      fyStyle: settings.invoice.fyStyle,
      fyStartMonth: settings.invoice.fyStartMonth,
      resetEachFinancialYear: settings.invoice.resetEachFinancialYear,
    },
    defaults: settings.defaults,
    inventory: {
      allowNegativeStock: Boolean(settings.inventory?.allowNegativeStock),
      lowStockThreshold: settings.inventory?.lowStockThreshold ?? settings.defaults?.lowStockThreshold ?? 5,
      valuation: settings.inventory?.valuation || 'purchase',
    },
    catalog: {
      showRetail: settings.catalog?.showRetail !== false,
      showWholesale: settings.catalog?.showWholesale !== false,
      showGst: Boolean(settings.catalog?.showGst),
      layout: settings.catalog?.layout || 'grid',
      perPage: settings.catalog?.perPage || 6,
    },
    documents: {
      maxUploadMb: settings.documents?.maxUploadMb || 8,
      allowedTypes: settings.documents?.allowedTypes?.length ? settings.documents.allowedTypes : ['pdf', 'jpg', 'jpeg', 'png'],
    },
  };
}

export function presentCustomer(customer: Loose) {
  return {
    id: String(customer._id),
    name: customer.name,
    mobile: customer.mobile || '',
    email: customer.email || '',
    gstin: customer.gstin || '',
    state: customer.state || '',
    stateCode: customer.stateCode || '',
    billingAddress: customer.billingAddress || {},
    shippingAddress: customer.shippingAddress || null,
    sameAsBilling: customer.sameAsBilling !== false,
    archived: Boolean(customer.archived),
    createdAt: customer.createdAt,
  };
}

export function presentProduct(product: Loose) {
  return {
    id: String(product._id),
    name: product.name,
    sku: product.sku || '',
    hsnSac: product.hsnSac || '',
    category: product.category || '',
    subCategory: product.subCategory || '',
    brand: product.brand || '',
    unit: product.unit || 'pcs',
    sellingPrice: product.sellingPrice,
    purchasePrice: product.purchasePrice ?? null,
    wholesalePrice: product.wholesalePrice ?? null,
    gstRate: product.gstRate,
    trackStock: Boolean(product.trackStock),
    stockQuantity: product.trackStock ? product.stockQuantity ?? 0 : null,
    lowStockThreshold: product.lowStockThreshold ?? 5,
    description: product.description || '',
    specifications: (product.specifications || []).map((row: Loose) => ({ label: row.label || '', value: row.value || '' })),
    images: (product.images || []).map((image: Loose) => ({
      id: String(image._id),
      url: image.path ? `/uploads/${image.path}` : '',
      alt: image.alt || '',
    })),
    status: product.status || 'active',
    archived: Boolean(product.archived),
  };
}

export function presentTaxRate(rate: Loose) {
  return {
    id: String(rate._id),
    name: rate.name,
    rate: rate.rate,
    active: Boolean(rate.active),
  };
}

export function bucketsFromItems(items: Loose[]) {
  const buckets = new Map<string, Loose>();
  for (const item of items) {
    const key = `${item.hsnSac || ''}|${item.gstRate}`;
    const current = buckets.get(key) ?? {
      hsnSac: item.hsnSac || '',
      gstRate: item.gstRate || 0,
      taxableAmount: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
      taxAmount: 0,
    };
    for (const field of ['taxableAmount', 'cgst', 'sgst', 'igst', 'taxAmount'] as const) {
      current[field] = fromPaise(toPaise(current[field]) + toPaise(item[field] || 0));
    }
    buckets.set(key, current);
  }
  return [...buckets.values()];
}

function plain(value: Loose | undefined): Loose {
  if (!value) return {};
  return typeof value.toObject === 'function' ? value.toObject() : { ...value };
}

export function presentInvoiceListItem(invoice: Loose) {
  return {
    id: String(invoice._id),
    number: invoice.number,
    invoiceDate: invoice.invoiceDateKey,
    dueDate: invoice.dueDateKey || '',
    customerId: invoice.customerId ? String(invoice.customerId) : '',
    customerName: invoice.customerSnapshot?.name || '—',
    status: invoice.status,
    statusLabel: statusLabel(invoice.status),
    grandTotal: invoice.totals?.grandTotal ?? 0,
    amountPaid: invoice.amountPaid ?? 0,
    amountDue: invoice.amountDue ?? 0,
    isGstInvoice: Boolean(invoice.isGstInvoice),
    supplyType: invoice.supplyType,
  };
}

export function presentPayment(payment: Loose) {
  return {
    id: String(payment._id),
    invoiceId: String(payment.invoiceId),
    amount: payment.amount,
    method: payment.method,
    methodLabel: methodLabel(payment.method),
    reference: payment.reference || '',
    notes: payment.notes || '',
    paidAt: payment.paidAtKey,
    createdAt: payment.createdAt,
  };
}

export function presentInvoiceDetail(invoice: Loose, payments: Loose[] = []) {
  const seller = plain(invoice.sellerSnapshot);
  delete seller.logoDataUrl;
  delete seller.signatureDataUrl;
  const items = (invoice.items || []).map((item: Loose) => {
    const row = plain(item);
    return {
      ...row,
      id: String(row._id),
      productId: row.productId ? String(row.productId) : null,
    };
  });
  const grand = invoice.totals?.grandTotal ?? 0;
  return {
    id: String(invoice._id),
    number: invoice.number,
    sequence: invoice.sequence || 0,
    financialYear: invoice.financialYear || '',
    status: invoice.status,
    statusLabel: statusLabel(invoice.status),
    invoiceDate: invoice.invoiceDateKey,
    dueDate: invoice.dueDateKey || '',
    placeOfSupply: invoice.placeOfSupply,
    supplyType: invoice.supplyType,
    isGstInvoice: Boolean(invoice.isGstInvoice),
    priceMode: invoice.priceMode,
    roundOffMode: invoice.roundOffMode,
    template: invoice.template,
    customerId: invoice.customerId ? String(invoice.customerId) : '',
    seller,
    customer: plain(invoice.customerSnapshot),
    items,
    invoiceDiscountMode: invoice.invoiceDiscountMode,
    invoiceDiscountValue: invoice.invoiceDiscountValue || 0,
    totals: invoice.totals,
    amountPaid: invoice.amountPaid ?? 0,
    amountDue: invoice.amountDue ?? 0,
    amountInWords: amountInWords(grand),
    notes: invoice.notes || '',
    terms: invoice.terms || '',
    footer: invoice.footer || '',
    cancelReason: invoice.cancelReason || '',
    shareToken: invoice.shareToken,
    sharePath: `/share/${invoice.shareToken}`,
    payments: payments.map(presentPayment),
    buckets: bucketsFromItems(items),
    createdAt: invoice.createdAt,
    updatedAt: invoice.updatedAt,
  };
}
