import bcrypt from 'bcryptjs';
import { addDays, todayKey } from './domain/dates.js';
import { gstinCheckCharacter } from './domain/gstin.js';
import { Business, Customer, Product, User } from './models.js';
import { saveBusiness, saveProduct } from './services/catalog.js';
import { createInvoice, recordPayment } from './services/invoices.js';

const DEMO_EMAIL = 'demo@kssports.test';

function gstin(stateCode: string, pan: string, entity = '1'): string {
  const body = `${stateCode}${pan}${entity}Z`;
  return body + gstinCheckCharacter(body);
}

async function ensureSports(businessId: string) {
  if (await Product.exists({ businessId, sku: 'KS-BAT-001' })) return;
  const shared = { brand: 'KS Sports', unit: 'pcs', trackStock: true, status: 'active' as const };
  await saveProduct(businessId, {
    ...shared,
    name: 'KS English Willow Cricket Bat',
    sku: 'KS-BAT-001',
    category: 'Cricket',
    subCategory: 'Bats',
    hsnSac: '9506',
    sellingPrice: 18500,
    purchasePrice: 12000,
    wholesalePrice: 15000,
    gstRate: 12,
    stockQuantity: 8,
    lowStockThreshold: 2,
    description: 'Grade A English willow bat pressed in the KS Sports workshop.',
    specifications: [
      { label: 'Grade', value: 'A' },
      { label: 'Weight', value: '1160g' },
      { label: 'Handle', value: 'Short handle' },
    ],
  });
  await saveProduct(businessId, {
    ...shared,
    name: 'Leather Cricket Ball',
    sku: 'KS-BAL-001',
    category: 'Cricket',
    subCategory: 'Balls',
    hsnSac: '9506',
    sellingPrice: 850,
    purchasePrice: 420,
    wholesalePrice: 640,
    gstRate: 12,
    stockQuantity: 40,
    description: 'Four-piece leather match ball.',
    specifications: [{ label: 'Weight', value: '156g' }],
  });
  await saveProduct(businessId, {
    ...shared,
    name: 'Batting Gloves',
    sku: 'KS-GLV-001',
    category: 'Cricket',
    subCategory: 'Protection',
    unit: 'pair',
    hsnSac: '9506',
    sellingPrice: 2400,
    purchasePrice: 1100,
    wholesalePrice: 1800,
    gstRate: 18,
    stockQuantity: 15,
    description: 'Padded club gloves.',
  });
}

export async function seedDemo(): Promise<void> {
  const legacy = await User.findOne({ email: 'demo@lekha.test' });
  if (legacy && !(await User.exists({ email: DEMO_EMAIL }))) {
    legacy.email = DEMO_EMAIL;
    legacy.name = 'KS Sports';
    await legacy.save();
  }
  const existing = await User.findOne({ email: DEMO_EMAIL });
  if (existing?.businessId) {
    await Business.updateOne(
      { _id: existing.businessId, name: 'Meera Textiles' },
      { $set: { name: 'KS Sports', email: 'hello@kssports.test' } },
    );
    await ensureSports(String(existing.businessId));
    return;
  }
  if (existing) return;
  const user = await User.create({
    name: 'KS Sports',
    email: DEMO_EMAIL,
    passwordHash: await bcrypt.hash('Demo@12345', 10),
    role: 'owner',
  });
  const pan = 'AAPFM8421Q';
  const { business } = await saveBusiness(String(user._id), {
    name: 'KS Sports',
    ownerName: 'KS Sports',
    mobile: '9829012345',
    email: 'hello@kssports.test',
    addressLine1: '14, Johari Bazaar',
    addressLine2: 'Near Hawa Mahal',
    city: 'Jaipur',
    stateCode: '08',
    pincode: '302003',
    gstin: gstin('08', pan),
    pan,
    upiId: 'meera@okaxis',
    bank: {
      bankName: 'State Bank of India',
      accountName: 'KS Sports',
      accountNumber: '39281055421',
      ifsc: 'SBIN0001234',
    },
  });
  const businessId = String(business._id);
  const ramesh = await Customer.create({
    businessId,
    name: 'Ramesh Agarwal',
    mobile: '9811122233',
    email: '',
    gstin: '',
    state: 'Rajasthan',
    stateCode: '08',
    billingAddress: { line1: '88, Chandpol', line2: '', city: 'Jaipur', state: 'Rajasthan', stateCode: '08', pincode: '302001' },
    sameAsBilling: true,
  });
  const school = await Customer.create({
    businessId,
    name: 'Pink City School',
    mobile: '9828055512',
    email: 'accounts@pinkcity.test',
    gstin: gstin('08', 'AABCP3344R'),
    state: 'Rajasthan',
    stateCode: '08',
    billingAddress: { line1: 'C-Scheme', line2: '', city: 'Jaipur', state: 'Rajasthan', stateCode: '08', pincode: '302001' },
    sameAsBilling: true,
  });
  const anokhi = await Customer.create({
    businessId,
    name: 'Anokhi House',
    mobile: '9820099001',
    email: 'orders@anokhi.test',
    gstin: gstin('27', 'AABCA7781K'),
    state: 'Maharashtra',
    stateCode: '27',
    billingAddress: { line1: '12, Colaba Causeway', line2: '', city: 'Mumbai', state: 'Maharashtra', stateCode: '27', pincode: '400005' },
    shippingAddress: { line1: 'Warehouse 4, Bhiwandi', line2: '', city: 'Thane', state: 'Maharashtra', stateCode: '27', pincode: '421302' },
    sameAsBilling: false,
  });

  const kurta = await saveProduct(businessId, {
    name: 'Handblock cotton kurta',
    sku: 'KT-COT-01',
    hsnSac: '6204',
    category: 'Apparel',
    unit: 'pcs',
    sellingPrice: 1850,
    gstRate: 5,
    trackStock: true,
    stockQuantity: 40,
    lowStockThreshold: 5,
    description: 'Indigo handblock, free size',
  });
  const stole = await saveProduct(businessId, {
    name: 'Silk stole',
    sku: 'ST-SLK-02',
    hsnSac: '6214',
    category: 'Apparel',
    unit: 'pcs',
    sellingPrice: 1450,
    gstRate: 12,
    trackStock: true,
    stockQuantity: 18,
    lowStockThreshold: 4,
    description: '',
  });
  const stitch = await saveProduct(businessId, {
    name: 'Alteration',
    sku: '',
    hsnSac: '9988',
    category: 'Services',
    unit: 'hrs',
    sellingPrice: 250,
    gstRate: 18,
    trackStock: false,
    description: 'In-shop stitching',
  });
  const buttons = await saveProduct(businessId, {
    name: 'Brass button pack',
    sku: 'BT-BR-10',
    hsnSac: '9606',
    category: 'Notions',
    unit: 'box',
    sellingPrice: 80,
    gstRate: 18,
    trackStock: true,
    stockQuantity: 3,
    lowStockThreshold: 5,
    description: '',
  });
  const cloth = await saveProduct(businessId, {
    name: 'Cotton running cloth',
    sku: 'CL-COT-M',
    hsnSac: '5208',
    category: 'Fabric',
    unit: 'm',
    sellingPrice: 220,
    gstRate: 5,
    trackStock: true,
    stockQuantity: 86.5,
    lowStockThreshold: 10,
    description: '',
  });

  const today = todayKey('Asia/Kolkata');
  const line = (product: { _id: unknown; name: string; sku?: string; hsnSac?: string; unit?: string; sellingPrice: number; gstRate: number }, quantity: number, discount = 0) => ({
    productId: String(product._id),
    name: product.name,
    sku: product.sku || '',
    hsnSac: product.hsnSac || '',
    unit: product.unit || 'pcs',
    quantity,
    rate: product.sellingPrice,
    discountMode: 'amount' as const,
    discountValue: discount,
    gstRate: product.gstRate,
    description: '',
  });

  const counterBill = await createInvoice(businessId, {
    status: 'unpaid',
    invoiceDate: addDays(today, -18),
    customerId: String(ramesh._id),
    placeOfSupplyStateCode: '08',
    items: [line(kurta, 2), line(stole, 1, 50)],
  });
  await recordPayment(businessId, {
    invoiceId: counterBill.invoice.id,
    amount: counterBill.invoice.totals.grandTotal,
    method: 'upi',
    paidAt: addDays(today, -18),
  });
  const schoolBill = await createInvoice(businessId, {
    status: 'unpaid',
    invoiceDate: addDays(today, -12),
    customerId: String(school._id),
    placeOfSupplyStateCode: '08',
    items: [line(cloth, 12.5), line(stitch, 4)],
  });
  await recordPayment(businessId, {
    invoiceId: schoolBill.invoice.id,
    amount: schoolBill.invoice.totals.grandTotal,
    method: 'bank_transfer',
    reference: 'NEFT 4412',
    paidAt: addDays(today, -11),
  });
  await createInvoice(businessId, {
    status: 'partial',
    invoiceDate: addDays(today, -6),
    customerId: String(anokhi._id),
    placeOfSupplyStateCode: '27',
    items: [line(kurta, 8), line(stole, 6), line(buttons, 4)],
    invoiceDiscountMode: 'percent',
    invoiceDiscountValue: 5,
    initialPayment: { amount: 5000, method: 'upi', reference: 'UPI 88', notes: '', paidAt: addDays(today, -5) },
  });
  await createInvoice(businessId, {
    status: 'unpaid',
    invoiceDate: today,
    dueDate: addDays(today, 7),
    customerId: String(ramesh._id),
    placeOfSupplyStateCode: '08',
    items: [line(kurta, 1), line(stitch, 1)],
    notes: 'Deliver after 5 pm.',
  });
  await createInvoice(businessId, {
    status: 'unpaid',
    invoiceDate: addDays(today, -40),
    dueDate: addDays(today, -10),
    customerId: String(school._id),
    placeOfSupplyStateCode: '08',
    items: [line(cloth, 4)],
  });
  await ensureSports(businessId);
  }

export const demoLogin = { email: DEMO_EMAIL, password: 'Demo@12345' };
