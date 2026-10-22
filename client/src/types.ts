export interface User {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'staff';
  hasBusiness: boolean;
}

export interface Address {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  stateCode?: string;
  pincode?: string;
}

export interface Bank {
  bankName: string;
  accountName: string;
  accountNumber: string;
  ifsc: string;
}

export interface Business {
  id: string;
  name: string;
  ownerName: string;
  mobile: string;
  email: string;
  address: Address;
  gstin: string;
  pan: string;
  state: string;
  stateCode: string;
  pincode: string;
  logoUrl: string;
  signatureUrl: string;
  bank: Bank | null;
  upiId: string;
  gstEnabled: boolean;
}

export interface Settings {
  invoice: {
    prefix: string;
    separator: '-' | '/';
    padLength: number;
    startingNumber: number;
    nextNumber: number;
    includeFinancialYear: boolean;
    fyStyle: 'start_year' | 'range';
    fyStartMonth: number;
    resetEachFinancialYear: boolean;
  };
  defaults: {
    paymentTermsDays: number;
    notes: string;
    terms: string;
    footer: string;
    roundOff: 'nearest_rupee' | 'none';
    priceMode: 'exclusive' | 'inclusive';
    template: 'classic' | 'modern' | 'compact';
    timezone: string;
    documentTitleGst: string;
    documentTitlePlain: string;
    signatory: string;
    lowStockThreshold: number;
  };
  inventory: { allowNegativeStock: boolean; lowStockThreshold: number; valuation: 'purchase' | 'average' | 'retail' };
  catalog: { showRetail: boolean; showWholesale: boolean; showGst: boolean; layout: 'grid' | 'list'; perPage: number };
  documents: { maxUploadMb: number; allowedTypes: string[] };
}

export interface StateRow {
  code: string;
  name: string;
  legacy?: boolean;
}

export interface Meta {
  states: StateRow[];
  paymentMethods: { id: string; label: string }[];
  units: string[];
  templates: { id: string; label: string; detail: string }[];
  statuses: { id: string; label: string }[];
}

export interface Customer {
  id: string;
  name: string;
  mobile: string;
  email: string;
  gstin: string;
  state: string;
  stateCode: string;
  billingAddress: Address;
  shippingAddress: Address | null;
  sameAsBilling: boolean;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  hsnSac: string;
  category: string;
  subCategory: string;
  brand: string;
  unit: string;
  sellingPrice: number;
  purchasePrice: number | null;
  wholesalePrice: number | null;
  gstRate: number;
  trackStock: boolean;
  stockQuantity: number | null;
  lowStockThreshold: number;
  description: string;
  specifications: { label: string; value: string }[];
  images: { id: string; url: string; alt: string }[];
  status: 'active' | 'inactive';
}

export interface TaxRate {
  id: string;
  name: string;
  rate: number;
  active: boolean;
}

export interface InvoiceListItem {
  id: string;
  number: string;
  invoiceDate: string;
  dueDate: string;
  customerId: string;
  customerName: string;
  status: string;
  statusLabel: string;
  grandTotal: number;
  amountPaid: number;
  amountDue: number;
  isGstInvoice: boolean;
  supplyType: string;
}

export interface InvoiceItem {
  id?: string;
  productId?: string | null;
  name: string;
  sku: string;
  hsnSac: string;
  description: string;
  unit: string;
  quantity: number;
  rate: number;
  discountMode: 'amount' | 'percent';
  discountValue: number;
  discountAmount: number;
  taxableAmount: number;
  gstRate: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

export interface InvoiceDetail {
  id: string;
  number: string;
  status: string;
  statusLabel: string;
  invoiceDate: string;
  dueDate: string;
  placeOfSupply: { state: string; stateCode: string };
  supplyType: 'intra' | 'inter' | 'non_gst';
  isGstInvoice: boolean;
  priceMode: 'exclusive' | 'inclusive';
  template: string;
  customerId: string;
  seller: { name: string; gstin?: string; address?: Address };
  customer: { name: string; gstin?: string; state?: string; stateCode?: string; mobile?: string; email?: string; billingAddress?: Address };
  items: InvoiceItem[];
  invoiceDiscountMode: 'amount' | 'percent';
  invoiceDiscountValue: number;
  totals: {
    subtotal: number;
    itemDiscount: number;
    invoiceDiscount: number;
    taxableAmount: number;
    cgst: number;
    sgst: number;
    igst: number;
    taxAmount: number;
    roundOff: number;
    grandTotal: number;
  };
  amountPaid: number;
  amountDue: number;
  amountInWords: string;
  notes: string;
  terms: string;
  footer: string;
  cancelReason: string;
  sharePath: string;
  payments: Payment[];
}

export interface Payment {
  id: string;
  invoiceId: string;
  invoiceNumber?: string;
  customerName?: string;
  amount: number;
  method: string;
  methodLabel: string;
  reference: string;
  notes: string;
  paidAt: string;
}

export interface CalcResult {
  supplyType: 'intra' | 'inter' | 'non_gst';
  taxableAmount: number;
  itemDiscount: number;
  invoiceDiscount: number;
  cgst: number;
  sgst: number;
  igst: number;
  taxAmount: number;
  roundOff: number;
  grandTotal: number;
  amountInWords: string;
  lines: { total: number; taxableAmount: number; cgst: number; sgst: number; igst: number; gstRate: number }[];
}
