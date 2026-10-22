import { amountInWords } from '../domain/words.js';
import { bucketsFromItems } from '../present.js';

export interface AddressView {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  stateCode?: string;
  pincode?: string;
}

export interface InvoiceView {
  number: string;
  status: string;
  invoiceDate: string;
  dueDate: string;
  placeOfSupply: { state: string; stateCode: string };
  supplyType: 'intra' | 'inter' | 'non_gst';
  isGstInvoice: boolean;
  template: string;
  notes: string;
  terms: string;
  footer: string;
  seller: {
    name: string;
    ownerName: string;
    mobile: string;
    email: string;
    address: AddressView;
    gstin: string;
    pan: string;
    state: string;
    stateCode: string;
    pincode: string;
    logoDataUrl?: string;
    signatureDataUrl?: string;
    bank: { bankName: string; accountName: string; accountNumber: string; ifsc: string } | null;
    upiId: string;
    signatory: string;
    documentTitle: string;
    footer: string;
  };
  customer: {
    name: string;
    mobile: string;
    email: string;
    gstin: string;
    state: string;
    stateCode: string;
    billingAddress: AddressView;
    shippingAddress: AddressView | null;
  };
  items: Array<{
    name: string;
    description: string;
    hsnSac: string;
    unit: string;
    quantity: number;
    rate: number;
    discountAmount: number;
    taxableAmount: number;
    gstRate: number;
    cgst: number;
    sgst: number;
    igst: number;
    total: number;
  }>;
  totals: {
    taxableAmount: number;
    itemDiscount: number;
    invoiceDiscount: number;
    cgst: number;
    sgst: number;
    igst: number;
    roundOff: number;
    grandTotal: number;
  };
  amountPaid: number;
  amountDue: number;
  amountInWords: string;
  cancelReason: string;
  buckets: ReturnType<typeof bucketsFromItems>;
}

type Loose = Record<string, any>;

function plain(value: Loose | undefined): Loose {
  if (!value) return {};
  return typeof value.toObject === 'function' ? value.toObject() : { ...value };
}

export function toInvoiceView(invoice: Loose): InvoiceView {
  const seller = plain(invoice.sellerSnapshot);
  const customer = plain(invoice.customerSnapshot);
  const items = (invoice.items || []).map((item: Loose) => plain(item));
  const grand = invoice.totals?.grandTotal ?? 0;
  return {
    number: invoice.number,
    status: invoice.status,
    invoiceDate: invoice.invoiceDateKey,
    dueDate: invoice.dueDateKey || '',
    placeOfSupply: invoice.placeOfSupply || { state: '', stateCode: '' },
    supplyType: invoice.supplyType,
    isGstInvoice: Boolean(invoice.isGstInvoice),
    template: invoice.template || 'classic',
    notes: invoice.notes || '',
    terms: invoice.terms || '',
    footer: invoice.footer || '',
    seller: {
      name: seller.name || '',
      ownerName: seller.ownerName || '',
      mobile: seller.mobile || '',
      email: seller.email || '',
      address: seller.address || {},
      gstin: seller.gstin || '',
      pan: seller.pan || '',
      state: seller.state || '',
      stateCode: seller.stateCode || '',
      pincode: seller.pincode || '',
      logoDataUrl: seller.logoDataUrl || '',
      signatureDataUrl: seller.signatureDataUrl || '',
      bank: seller.bank?.bankName ? seller.bank : null,
      upiId: seller.upiId || '',
      signatory: seller.signatory || '',
      documentTitle: seller.documentTitle || '',
      footer: seller.footer || '',
    },
    customer: {
      name: customer.name || '',
      mobile: customer.mobile || '',
      email: customer.email || '',
      gstin: customer.gstin || '',
      state: customer.state || '',
      stateCode: customer.stateCode || '',
      billingAddress: customer.billingAddress || {},
      shippingAddress: customer.shippingAddress || null,
    },
    items,
    totals: invoice.totals,
    amountPaid: invoice.amountPaid ?? 0,
    amountDue: invoice.amountDue ?? 0,
    amountInWords: amountInWords(grand),
    cancelReason: invoice.cancelReason || '',
    buckets: bucketsFromItems(items),
  };
}
