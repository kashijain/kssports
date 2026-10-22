import { z } from 'zod';

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date.');

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name.').max(80),
  email: z.string().trim().email('Enter a valid email.').max(120),
  password: z
    .string()
    .min(8, 'Use at least 8 characters.')
    .max(100)
    .regex(/[A-Za-z]/, 'Include a letter.')
    .regex(/[0-9]/, 'Include a number.'),
});

export const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email.'),
  password: z.string().min(1, 'Enter your password.'),
});

export const forgotSchema = z.object({
  email: z.string().trim().email('Enter a valid email.'),
});

export const resetSchema = z.object({
  token: z.string().min(20, 'This reset link is invalid.'),
  password: registerSchema.shape.password,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password.'),
  newPassword: registerSchema.shape.password,
});

const addressSchema = z.object({
  line1: z.string().trim().max(160).optional().default(''),
  line2: z.string().trim().max(160).optional().default(''),
  city: z.string().trim().max(80).optional().default(''),
  pincode: z.string().trim().max(6).optional().default(''),
});

export const customerSchema = z.object({
  name: z.string().trim().min(1, 'Enter the customer name.').max(120),
  mobile: z.string().trim().max(20).optional().default(''),
  email: z.string().trim().max(120).optional().default(''),
  gstin: z.string().trim().max(20).optional().default(''),
  stateCode: z.string().trim().min(1, 'Choose a state.'),
  billingAddress: addressSchema.optional(),
  shippingAddress: addressSchema
    .extend({ stateCode: z.string().trim().optional().default('') })
    .nullable()
    .optional(),
  sameAsBilling: z.boolean().optional().default(true),
});

export const productSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name.').max(160),
  sku: z.string().trim().max(40).optional().default(''),
  hsnSac: z.string().trim().max(16).optional().default(''),
  category: z.string().trim().max(60).optional().default(''),
  subCategory: z.string().trim().max(60).optional().default(''),
  brand: z.string().trim().max(60).optional().default(''),
  unit: z.string().trim().min(1).max(20).optional().default('pcs'),
  sellingPrice: z.number().min(0, 'Price cannot be negative.'),
  purchasePrice: z.number().min(0).nullable().optional(),
  wholesalePrice: z.number().min(0).nullable().optional(),
  gstRate: z.number().min(0).max(100),
  trackStock: z.boolean().optional().default(false),
  stockQuantity: z.number().min(0).nullable().optional(),
  lowStockThreshold: z.number().min(0).max(1_000_000).optional(),
  description: z.string().trim().max(800).optional().default(''),
  specifications: z
    .array(z.object({ label: z.string().trim().max(40), value: z.string().trim().max(80) }))
    .max(24)
    .optional()
    .default([]),
  status: z.enum(['active', 'inactive']).optional().default('active'),
});

export const taxRateSchema = z.object({
  rate: z.number().min(0, 'Rate cannot be negative.').max(100, 'Rate cannot exceed 100.'),
  name: z.string().trim().max(40).optional(),
});

export const taxRatePatchSchema = z.object({
  rate: z.number().min(0).max(100).optional(),
  name: z.string().trim().min(1).max(40).optional(),
  active: z.boolean().optional(),
});

const bankSchema = z
  .object({
    bankName: z.string().trim().max(80).optional().default(''),
    accountName: z.string().trim().max(80).optional().default(''),
    accountNumber: z.string().trim().max(30).optional().default(''),
    ifsc: z.string().trim().max(20).optional().default(''),
  })
  .nullable()
  .optional();

export const businessSchema = z.object({
  name: z.string().trim().min(2, 'Enter the business name.').max(120),
  ownerName: z.string().trim().min(2, 'Enter the owner name.').max(80),
  mobile: z.string().trim().min(8, 'Enter a mobile number.').max(20),
  email: z.string().trim().max(120).optional().default(''),
  addressLine1: z.string().trim().min(3, 'Enter the address.').max(160),
  addressLine2: z.string().trim().max(160).optional().default(''),
  city: z.string().trim().min(2, 'Enter the city.').max(80),
  stateCode: z.string().trim().min(1, 'Choose a state.'),
  pincode: z.string().trim().regex(/^[1-9][0-9]{5}$/, 'Enter a 6-digit pincode.'),
  gstin: z.string().trim().max(20).optional().default(''),
  pan: z.string().trim().max(12).optional().default(''),
  upiId: z.string().trim().max(80).optional().default(''),
  bank: bankSchema,
});

export const settingsSchema = z.object({
  invoice: z
    .object({
      prefix: z.string().trim().min(1).max(12).regex(/^[A-Za-z0-9]+$/, 'Prefix can use letters and numbers.'),
      separator: z.enum(['-', '/']),
      padLength: z.number().int().min(1).max(8),
      startingNumber: z.number().int().min(1).max(9_999_999),
      includeFinancialYear: z.boolean(),
      fyStyle: z.enum(['start_year', 'range']),
      fyStartMonth: z.number().int().min(1).max(12),
      resetEachFinancialYear: z.boolean(),
    })
    .optional(),
  defaults: z
    .object({
      paymentTermsDays: z.number().int().min(0).max(365),
      notes: z.string().trim().max(2000),
      terms: z.string().trim().max(4000),
      footer: z.string().trim().max(500),
      roundOff: z.enum(['nearest_rupee', 'none']),
      priceMode: z.enum(['exclusive', 'inclusive']),
      template: z.enum(['classic', 'modern', 'compact']),
      timezone: z.string().trim().min(1).max(60),
      documentTitleGst: z.string().trim().min(1).max(40),
      documentTitlePlain: z.string().trim().min(1).max(40),
      signatory: z.string().trim().max(80),
      lowStockThreshold: z.number().int().min(0).max(1_000_000),
    })
    .optional(),
  inventory: z
    .object({
      allowNegativeStock: z.boolean(),
      lowStockThreshold: z.number().min(0).max(1_000_000),
      valuation: z.enum(['purchase', 'average', 'retail']),
    })
    .optional(),
  catalog: z
    .object({
      showRetail: z.boolean(),
      showWholesale: z.boolean(),
      showGst: z.boolean(),
      layout: z.enum(['grid', 'list']),
      perPage: z.number().int().min(1).max(12),
    })
    .optional(),
  documents: z
    .object({
      maxUploadMb: z.number().min(1).max(20),
      allowedTypes: z.array(z.enum(['pdf', 'jpg', 'jpeg', 'png'])).min(1),
    })
    .optional(),
});

const itemSchema = z.object({
  productId: z.string().trim().nullable().optional(),
  name: z.string().trim().min(1, 'Enter the item name.').max(160),
  sku: z.string().trim().max(40).optional().default(''),
  hsnSac: z.string().trim().max(16).optional().default(''),
  description: z.string().trim().max(300).optional().default(''),
  unit: z.string().trim().max(20).optional().default('pcs'),
  quantity: z.number().positive('Quantity must be greater than zero.'),
  rate: z.number().min(0, 'Rate cannot be negative.'),
  discountMode: z.enum(['amount', 'percent']).optional().default('amount'),
  discountValue: z.number().min(0).optional().default(0),
  gstRate: z.number().min(0).max(100).optional().default(0),
});

const paymentSchema = z.object({
  amount: z.number().positive('Enter the amount received.'),
  method: z.enum(['cash', 'upi', 'bank_transfer', 'card', 'cheque', 'other']),
  reference: z.string().trim().max(80).optional().default(''),
  notes: z.string().trim().max(200).optional().default(''),
  paidAt: dateKey.optional(),
});

export const invoiceSchema = z
  .object({
    status: z.enum(['draft', 'unpaid', 'partial', 'paid']).default('unpaid'),
    invoiceDate: dateKey,
    dueDate: z.string().trim().optional().default(''),
    customerId: z.string().trim().nullable().optional(),
    newCustomer: customerSchema.optional(),
    refreshCustomer: z.boolean().optional().default(false),
    placeOfSupplyStateCode: z.string().trim().optional().default(''),
    items: z.array(itemSchema).max(100).optional().default([]),
    invoiceDiscountMode: z.enum(['amount', 'percent']).optional().default('amount'),
    invoiceDiscountValue: z.number().min(0).optional().default(0),
    notes: z.string().trim().max(2000).optional(),
    terms: z.string().trim().max(4000).optional(),
    footer: z.string().trim().max(500).optional(),
    number: z.string().trim().max(40).optional().default(''),
    initialPayment: paymentSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.status !== 'draft' && value.items.length === 0) {
      ctx.addIssue({ code: 'custom', message: 'Add at least one item.', path: ['items'] });
    }
    if (value.status !== 'draft' && !value.customerId && !value.newCustomer) {
      ctx.addIssue({ code: 'custom', message: 'Choose a customer.', path: ['customerId'] });
    }
    if (value.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(value.dueDate)) {
      ctx.addIssue({ code: 'custom', message: 'Use a valid due date.', path: ['dueDate'] });
    }
  });

export const calculateSchema = z.object({
  lines: z
    .array(
      z.object({
        quantity: z.number().positive(),
        rate: z.number().min(0),
        discountMode: z.enum(['amount', 'percent']).optional(),
        discountValue: z.number().min(0).optional(),
        gstRate: z.number().min(0).max(100).optional(),
        hsnSac: z.string().optional(),
      }),
    )
    .max(100),
  invoiceDiscountMode: z.enum(['amount', 'percent']).optional(),
  invoiceDiscountValue: z.number().min(0).optional(),
  placeOfSupplyStateCode: z.string().optional().default(''),
  priceMode: z.enum(['exclusive', 'inclusive']).optional(),
  roundOff: z.enum(['nearest_rupee', 'none']).optional(),
  gstApplicable: z.boolean().optional(),
});

export const recordPaymentSchema = z.object({
  invoiceId: z.string().min(1, 'Choose an invoice.'),
  amount: z.number().positive('Enter the amount received.'),
  method: z.enum(['cash', 'upi', 'bank_transfer', 'card', 'cheque', 'other']),
  reference: z.string().trim().max(80).optional().default(''),
  notes: z.string().trim().max(200).optional().default(''),
  paidAt: dateKey.optional(),
});

export const cancelSchema = z.object({
  reason: z.string().trim().max(200).optional().default(''),
});

export type CustomerInput = z.infer<typeof customerSchema>;
export type ProductInput = z.infer<typeof productSchema>;
export type BusinessInput = z.infer<typeof businessSchema>;
export type InvoiceInput = z.infer<typeof invoiceSchema>;
export type SettingsInput = z.infer<typeof settingsSchema>;
