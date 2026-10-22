import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const addressSchema = new Schema(
  {
    line1: { type: String, default: '' },
    line2: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    stateCode: { type: String, default: '' },
    pincode: { type: String, default: '' },
  },
  { _id: false },
);

const bankSchema = new Schema(
  {
    bankName: { type: String, default: '' },
    accountName: { type: String, default: '' },
    accountNumber: { type: String, default: '' },
    ifsc: { type: String, default: '' },
  },
  { _id: false },
);

const userSchema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['owner', 'staff'], default: 'owner' },
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', default: null },
    tokenVersion: { type: Number, default: 0 },
    resetTokenHash: { type: String, default: '' },
    resetTokenExpires: { type: Date, default: null },
  },
  { timestamps: true },
);

const businessSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true },
    ownerName: { type: String, required: true },
    mobile: { type: String, default: '' },
    email: { type: String, default: '' },
    address: { type: addressSchema, default: () => ({}) },
    gstin: { type: String, default: '' },
    pan: { type: String, default: '' },
    state: { type: String, default: '' },
    stateCode: { type: String, default: '' },
    pincode: { type: String, default: '' },
    logoPath: { type: String, default: '' },
    signaturePath: { type: String, default: '' },
    bank: { type: bankSchema, default: null },
    upiId: { type: String, default: '' },
  },
  { timestamps: true },
);

const settingsSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true, unique: true },
    invoice: {
      prefix: { type: String, default: 'INV' },
      separator: { type: String, default: '-' },
      padLength: { type: Number, default: 4 },
      startingNumber: { type: Number, default: 1 },
      nextNumber: { type: Number, default: 1 },
      includeFinancialYear: { type: Boolean, default: true },
      fyStyle: { type: String, enum: ['start_year', 'range'], default: 'start_year' },
      fyStartMonth: { type: Number, default: 4 },
      resetEachFinancialYear: { type: Boolean, default: true },
      currentFyStartYear: { type: Number, default: 0 },
      lastAllocated: { type: Number, default: 0 },
    },
    defaults: {
      paymentTermsDays: { type: Number, default: 15 },
      notes: { type: String, default: '' },
      terms: { type: String, default: '' },
      footer: { type: String, default: 'Thank you for your business.' },
      roundOff: { type: String, enum: ['nearest_rupee', 'none'], default: 'nearest_rupee' },
      priceMode: { type: String, enum: ['exclusive', 'inclusive'], default: 'exclusive' },
      template: { type: String, enum: ['classic', 'modern', 'compact'], default: 'classic' },
      timezone: { type: String, default: 'Asia/Kolkata' },
      documentTitleGst: { type: String, default: 'Tax Invoice' },
      documentTitlePlain: { type: String, default: 'Invoice' },
      signatory: { type: String, default: '' },
      lowStockThreshold: { type: Number, default: 5 },
    },
    inventory: {
      allowNegativeStock: { type: Boolean, default: false },
      lowStockThreshold: { type: Number, default: 5 },
      valuation: { type: String, enum: ['purchase', 'average', 'retail'], default: 'purchase' },
    },
    catalog: {
      showRetail: { type: Boolean, default: true },
      showWholesale: { type: Boolean, default: true },
      showGst: { type: Boolean, default: false },
      layout: { type: String, enum: ['grid', 'list'], default: 'grid' },
      perPage: { type: Number, default: 6 },
    },
    documents: {
      maxUploadMb: { type: Number, default: 8 },
      allowedTypes: { type: [String], default: ['pdf', 'jpg', 'jpeg', 'png'] },
    },
    purchaseNext: { type: Number, default: 1 },
  },
  { timestamps: true },
);

const taxRateSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    name: { type: String, required: true },
    rate: { type: Number, required: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);
taxRateSchema.index({ businessId: 1, rate: 1 }, { unique: true });

const customerSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    name: { type: String, required: true },
    mobile: { type: String, default: '' },
    email: { type: String, default: '' },
    gstin: { type: String, default: '' },
    state: { type: String, default: '' },
    stateCode: { type: String, default: '' },
    billingAddress: { type: addressSchema, default: () => ({}) },
    shippingAddress: { type: addressSchema, default: null },
    sameAsBilling: { type: Boolean, default: true },
    archived: { type: Boolean, default: false },
  },
  { timestamps: true },
);

const productSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    name: { type: String, required: true },
    sku: { type: String, default: '' },
    hsnSac: { type: String, default: '' },
    category: { type: String, default: '' },
    subCategory: { type: String, default: '' },
    brand: { type: String, default: '' },
    unit: { type: String, default: 'pcs' },
    sellingPrice: { type: Number, required: true },
    purchasePrice: { type: Number, default: null },
    wholesalePrice: { type: Number, default: null },
    gstRate: { type: Number, default: 0 },
    trackStock: { type: Boolean, default: false },
    stockQuantity: { type: Number, default: null },
    lowStockThreshold: { type: Number, default: 5 },
    description: { type: String, default: '' },
    specifications: { type: [{ label: String, value: String }], default: [] },
    images: {
      type: [{ path: String, alt: { type: String, default: '' } }],
      default: [],
    },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    archived: { type: Boolean, default: false },
  },
  { timestamps: true },
);
productSchema.index(
  { businessId: 1, sku: 1 },
  { unique: true, partialFilterExpression: { sku: { $type: 'string', $gt: '' } } },
);

const invoiceItemSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', default: null },
    name: { type: String, required: true },
    sku: { type: String, default: '' },
    hsnSac: { type: String, default: '' },
    description: { type: String, default: '' },
    unit: { type: String, default: 'pcs' },
    quantity: { type: Number, required: true },
    rate: { type: Number, required: true },
    discountMode: { type: String, enum: ['amount', 'percent'], default: 'amount' },
    discountValue: { type: Number, default: 0 },
    grossAmount: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    invoiceDiscountShare: { type: Number, default: 0 },
    taxableAmount: { type: Number, default: 0 },
    gstRate: { type: Number, default: 0 },
    cgst: { type: Number, default: 0 },
    sgst: { type: Number, default: 0 },
    igst: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    unitCost: { type: Number, default: null },
  },
  { _id: true },
);

const sellerSnapshotSchema = new Schema(
  {
    name: String,
    ownerName: String,
    mobile: String,
    email: String,
    address: addressSchema,
    gstin: String,
    pan: String,
    state: String,
    stateCode: String,
    pincode: String,
    logoDataUrl: { type: String, default: '' },
    signatureDataUrl: { type: String, default: '' },
    bank: { type: bankSchema, default: null },
    upiId: { type: String, default: '' },
    signatory: { type: String, default: '' },
    documentTitle: { type: String, default: 'Invoice' },
    footer: { type: String, default: '' },
  },
  { _id: false },
);

const customerSnapshotSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, default: null },
    name: { type: String, default: '' },
    mobile: { type: String, default: '' },
    email: { type: String, default: '' },
    gstin: { type: String, default: '' },
    state: { type: String, default: '' },
    stateCode: { type: String, default: '' },
    billingAddress: { type: addressSchema, default: () => ({}) },
    shippingAddress: { type: addressSchema, default: null },
  },
  { _id: false },
);

const invoiceSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    number: { type: String, required: true },
    sequence: { type: Number, default: 0 },
    financialYear: { type: String, default: '' },
    status: { type: String, enum: ['draft', 'unpaid', 'partial', 'paid', 'cancelled'], default: 'unpaid' },
    invoiceDateKey: { type: String, required: true, index: true },
    dueDateKey: { type: String, default: '' },
    placeOfSupply: {
      state: { type: String, default: '' },
      stateCode: { type: String, default: '' },
    },
    supplyType: { type: String, enum: ['intra', 'inter', 'non_gst'], default: 'non_gst' },
    isGstInvoice: { type: Boolean, default: false },
    priceMode: { type: String, enum: ['exclusive', 'inclusive'], default: 'exclusive' },
    roundOffMode: { type: String, enum: ['nearest_rupee', 'none'], default: 'nearest_rupee' },
    template: { type: String, enum: ['classic', 'modern', 'compact'], default: 'classic' },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', default: null },
    sellerSnapshot: { type: sellerSnapshotSchema, required: true },
    customerSnapshot: { type: customerSnapshotSchema, required: true },
    items: { type: [invoiceItemSchema], default: [] },
    invoiceDiscountMode: { type: String, enum: ['amount', 'percent'], default: 'amount' },
    invoiceDiscountValue: { type: Number, default: 0 },
    totals: {
      subtotal: { type: Number, default: 0 },
      itemDiscount: { type: Number, default: 0 },
      invoiceDiscount: { type: Number, default: 0 },
      taxableAmount: { type: Number, default: 0 },
      cgst: { type: Number, default: 0 },
      sgst: { type: Number, default: 0 },
      igst: { type: Number, default: 0 },
      taxAmount: { type: Number, default: 0 },
      roundOff: { type: Number, default: 0 },
      grandTotal: { type: Number, default: 0 },
    },
    amountPaid: { type: Number, default: 0 },
    amountDue: { type: Number, default: 0 },
    notes: { type: String, default: '' },
    terms: { type: String, default: '' },
    footer: { type: String, default: '' },
    cancelReason: { type: String, default: '' },
    shareToken: { type: String, required: true, unique: true },
  },
  { timestamps: true },
);
invoiceSchema.index({ businessId: 1, number: 1 }, { unique: true });

const paymentSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice', required: true, index: true },
    amount: { type: Number, required: true },
    method: {
      type: String,
      enum: ['cash', 'upi', 'bank_transfer', 'card', 'cheque', 'other'],
      required: true,
    },
    reference: { type: String, default: '' },
    notes: { type: String, default: '' },
    paidAtKey: { type: String, required: true },
  },
  { timestamps: true },
);

const categorySchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    name: { type: String, required: true },
    parentId: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
  },
  { timestamps: true },
);
categorySchema.index({ businessId: 1, name: 1, parentId: 1 }, { unique: true });

const supplierSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    name: { type: String, required: true },
    company: { type: String, default: '' },
    mobile: { type: String, default: '' },
    email: { type: String, default: '' },
    address: { type: addressSchema, default: () => ({}) },
    gstin: { type: String, default: '' },
    state: { type: String, default: '' },
    stateCode: { type: String, default: '' },
    archived: { type: Boolean, default: false },
  },
  { timestamps: true },
);

const purchaseItemSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', default: null },
    name: { type: String, required: true },
    sku: { type: String, default: '' },
    quantity: { type: Number, required: true },
    purchasePrice: { type: Number, required: true },
    discountMode: { type: String, enum: ['amount', 'percent'], default: 'amount' },
    discountValue: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    taxableAmount: { type: Number, default: 0 },
    gstRate: { type: Number, default: 0 },
    cgst: { type: Number, default: 0 },
    sgst: { type: Number, default: 0 },
    igst: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
  },
  { _id: true },
);

const purchaseSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    number: { type: String, required: true },
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier', default: null },
    supplierSnapshot: { type: Schema.Types.Mixed, required: true },
    supplierInvoice: { type: String, default: '' },
    purchaseDateKey: { type: String, required: true, index: true },
    dueDateKey: { type: String, default: '' },
    status: { type: String, enum: ['unpaid', 'partial', 'paid', 'cancelled'], default: 'unpaid' },
    paymentMethod: { type: String, default: 'bank_transfer' },
    placeOfSupply: { state: String, stateCode: String },
    supplyType: { type: String, enum: ['intra', 'inter', 'non_gst'], default: 'non_gst' },
    items: { type: [purchaseItemSchema], default: [] },
    totals: { type: Schema.Types.Mixed, default: () => ({}) },
    amountPaid: { type: Number, default: 0 },
    amountDue: { type: Number, default: 0 },
    notes: { type: String, default: '' },
    payments: {
      type: [
        {
          amount: Number,
          method: String,
          reference: { type: String, default: '' },
          paidAtKey: String,
          notes: { type: String, default: '' },
        },
      ],
      default: [],
    },
  },
  { timestamps: true },
);
purchaseSchema.index({ businessId: 1, number: 1 }, { unique: true });

const stockMovementSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    type: { type: String, enum: ['purchase', 'sale', 'sale_reversal', 'adjustment', 'opening'], required: true },
    reference: { type: String, default: '' },
    dateKey: { type: String, required: true },
    qtyIn: { type: Number, default: 0 },
    qtyOut: { type: Number, default: 0 },
    balance: { type: Number, required: true },
    note: { type: String, default: '' },
  },
  { timestamps: true },
);

const machineSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    name: { type: String, required: true },
    machineType: { type: String, default: '' },
    machineCode: { type: String, default: '' },
    brand: { type: String, default: '' },
    model: { type: String, default: '' },
    serialNumber: { type: String, default: '' },
    purchaseDateKey: { type: String, default: '' },
    purchasePrice: { type: Number, default: 0 },
    supplierName: { type: String, default: '' },
    warrantyStart: { type: String, default: '' },
    warrantyEnd: { type: String, default: '' },
    installationDate: { type: String, default: '' },
    status: { type: String, enum: ['active', 'maintenance', 'inactive', 'sold'], default: 'active' },
    location: { type: String, default: '' },
    photoPath: { type: String, default: '' },
    notes: { type: String, default: '' },
    archived: { type: Boolean, default: false },
  },
  { timestamps: true },
);

const maintenanceSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    machineId: { type: Schema.Types.ObjectId, ref: 'Machine', required: true, index: true },
    dateKey: { type: String, required: true },
    maintenanceType: { type: String, required: true },
    vendor: { type: String, default: '' },
    cost: { type: Number, default: 0 },
    description: { type: String, default: '' },
    nextDateKey: { type: String, default: '' },
  },
  { timestamps: true },
);

const expenseCategorySchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    name: { type: String, required: true },
  },
  { timestamps: true },
);
expenseCategorySchema.index({ businessId: 1, name: 1 }, { unique: true });

const expenseSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    name: { type: String, required: true },
    category: { type: String, required: true },
    amount: { type: Number, required: true },
    dateKey: { type: String, required: true, index: true },
    method: { type: String, default: 'cash' },
    vendor: { type: String, default: '' },
    notes: { type: String, default: '' },
    archived: { type: Boolean, default: false },
  },
  { timestamps: true },
);

const documentSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    name: { type: String, required: true },
    originalName: { type: String, required: true },
    mime: { type: String, required: true },
    size: { type: Number, required: true },
    path: { type: String, required: true },
    module: {
      type: String,
      enum: ['purchase', 'machine', 'maintenance', 'expense', 'customer', 'product', 'business'],
      required: true,
    },
    recordId: { type: Schema.Types.ObjectId, required: true, index: true },
  },
  { timestamps: true },
);

export const User = mongoose.model('User', userSchema);
export const Business = mongoose.model('Business', businessSchema);
export const BusinessSettings = mongoose.model('BusinessSettings', settingsSchema);
export const TaxRate = mongoose.model('TaxRate', taxRateSchema);
export const Customer = mongoose.model('Customer', customerSchema);
export const Product = mongoose.model('Product', productSchema);
export const Invoice = mongoose.model('Invoice', invoiceSchema);
export const Payment = mongoose.model('Payment', paymentSchema);
export const Category = mongoose.model('Category', categorySchema);
export const Supplier = mongoose.model('Supplier', supplierSchema);
export const Purchase = mongoose.model('Purchase', purchaseSchema);
export const StockMovement = mongoose.model('StockMovement', stockMovementSchema);
export const Machine = mongoose.model('Machine', machineSchema);
export const MachineMaintenance = mongoose.model('MachineMaintenance', maintenanceSchema);
export const ExpenseCategory = mongoose.model('ExpenseCategory', expenseCategorySchema);
export const Expense = mongoose.model('Expense', expenseSchema);
export const DocumentFile = mongoose.model('DocumentFile', documentSchema);

export type UserDoc = InferSchemaType<typeof userSchema> & { _id: mongoose.Types.ObjectId };
export type BusinessDoc = InferSchemaType<typeof businessSchema> & { _id: mongoose.Types.ObjectId };
export type SettingsDoc = InferSchemaType<typeof settingsSchema> & { _id: mongoose.Types.ObjectId };
