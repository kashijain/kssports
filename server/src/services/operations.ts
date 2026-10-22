import fs from 'node:fs';
import path from 'node:path';
import { calculateInvoice } from '../domain/gst.js';
import { todayKey } from '../domain/dates.js';
import { validateGstin } from '../domain/gstin.js';
import { fromPaise, toPaise } from '../domain/money.js';
import { findState } from '../domain/states.js';
import { HttpError } from '../http.js';
import {
  Business,
  BusinessSettings,
  Category,
  DocumentFile,
  Expense,
  ExpenseCategory,
  Invoice,
  Machine,
  MachineMaintenance,
  Product,
  Purchase,
  StockMovement,
  Supplier,
} from '../models.js';
import { uploadsDir } from '../config.js';
import { brandLogoDataUrl, readDataUrl, removeUpload } from './files.js';
import { commitStock } from './stock.js';
import { isDuplicate } from '../util.js';

const EXPENSE_DEFAULTS = ['Electricity', 'Rent', 'Salary', 'Machine maintenance', 'Transport', 'Packaging', 'Marketing', 'Raw material', 'Other'];

function rejected(result: { ok: boolean; message?: string }) {
  return result.ok ? '' : result.message || 'Check that value.';
}

export async function listCategories(businessId: string) {
  return Category.find({ businessId }).sort({ name: 1 });
}

export async function saveCategory(businessId: string, name: string, parentId?: string | null, id?: string) {
  const clean = name.trim();
  if (!clean) throw new HttpError(400, 'Enter a category name.');
  try {
    if (id) {
      const row = await Category.findOneAndUpdate({ _id: id, businessId }, { name: clean, parentId: parentId || null }, { new: true });
      if (!row) throw new HttpError(404, 'Category not found.');
      return row;
    }
    return await Category.create({ businessId, name: clean, parentId: parentId || null });
  } catch (error) {
    if (isDuplicate(error)) throw new HttpError(409, 'That category already exists.');
    throw error;
  }
}

export async function saveSupplier(businessId: string, input: Record<string, string>, id?: string) {
  const state = findState(input.stateCode || '');
  if (!state) throw new HttpError(400, 'Choose the supplier state.');
  let gstin = '';
  if (input.gstin?.trim()) {
    const result = validateGstin(input.gstin, { expectedStateCode: state.code });
    const message = rejected(result as { ok: boolean; message?: string });
    if (message) throw new HttpError(400, message);
    gstin = (result as { gstin: string }).gstin;
  }
  const payload = {
    name: input.name.trim(),
    company: input.company?.trim() || '',
    mobile: input.mobile?.trim() || '',
    email: input.email?.trim() || '',
    gstin,
    state: state.name,
    stateCode: state.code,
    address: {
      line1: input.addressLine1?.trim() || '',
      line2: input.addressLine2?.trim() || '',
      city: input.city?.trim() || '',
      state: state.name,
      stateCode: state.code,
      pincode: input.pincode?.trim() || '',
    },
  };
  if (!payload.name) throw new HttpError(400, 'Enter the supplier name.');
  if (id) {
    const row = await Supplier.findOneAndUpdate({ _id: id, businessId, archived: { $ne: true } }, payload, { new: true });
    if (!row) throw new HttpError(404, 'Supplier not found.');
    return row;
  }
  return Supplier.create({ businessId, ...payload });
}

function snapshotSupplier(supplier: { _id?: unknown; name: string; company?: string; mobile?: string; email?: string; gstin?: string; state?: string; stateCode?: string; address?: unknown }) {
  return {
    supplierId: supplier._id || null,
    name: supplier.name,
    company: supplier.company || '',
    mobile: supplier.mobile || '',
    email: supplier.email || '',
    gstin: supplier.gstin || '',
    state: supplier.state || '',
    stateCode: supplier.stateCode || '',
    address: supplier.address || {},
  };
}

export async function createPurchase(businessId: string, input: {
  supplierId?: string;
  supplier?: Record<string, string>;
  supplierInvoice: string;
  purchaseDate: string;
  dueDate?: string;
  status: 'unpaid' | 'partial' | 'paid';
  paymentMethod: string;
  items: { productId?: string | null; name: string; sku?: string; quantity: number; purchasePrice: number; discountMode?: 'amount' | 'percent'; discountValue?: number; gstRate?: number }[];
  paidAmount?: number;
  notes?: string;
}) {
  const business = await Business.findById(businessId);
  const settings = await BusinessSettings.findOne({ businessId });
  if (!business || !settings) throw new HttpError(409, 'Add your business profile to continue.');
  let supplierDoc = input.supplierId ? await Supplier.findOne({ _id: input.supplierId, businessId, archived: { $ne: true } }) : null;
  if (!supplierDoc && input.supplier) supplierDoc = await saveSupplier(businessId, input.supplier);
  if (!supplierDoc) throw new HttpError(400, 'Choose a supplier.');
  if (!input.items.length) throw new HttpError(400, 'Add at least one purchased product.');
  let totals;
  try {
    totals = calculateInvoice({
      lines: input.items.map((item) => ({
        quantity: item.quantity,
        rate: item.purchasePrice,
        discountMode: item.discountMode || 'amount',
        discountValue: item.discountValue || 0,
        gstRate: item.gstRate || 0,
      })),
      gstApplicable: Boolean(business.gstin),
      sellerStateCode: supplierDoc.stateCode,
      placeOfSupplyStateCode: business.stateCode,
      priceMode: 'exclusive',
      roundOff: (settings.defaults.roundOff as 'nearest_rupee' | 'none') || 'nearest_rupee',
    });
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : 'Could not total this purchase.');
  }
  const held = await BusinessSettings.findOneAndUpdate({ businessId }, { $inc: { purchaseNext: 1 } }, { new: false });
  const seq = held?.purchaseNext || 1;
  const year = input.purchaseDate.slice(0, 4);
  const number = `PUR-${year}-${String(seq).padStart(4, '0')}`;
  const items = input.items.map((item, index) => {
    const line = totals.lines[index];
    return {
      productId: item.productId || null,
      name: item.name,
      sku: item.sku || '',
      quantity: line.quantity,
      purchasePrice: line.rate,
      discountMode: line.discountMode,
      discountValue: line.discountValue,
      discountAmount: line.discountAmount,
      taxableAmount: line.taxableAmount,
      gstRate: line.gstRate,
      cgst: line.cgst,
      sgst: line.sgst,
      igst: line.igst,
      total: line.total,
    };
  });
  const grand = totals.grandTotal;
  let paid = 0;
  if (input.status === 'paid') paid = grand;
  if (input.status === 'partial') paid = input.paidAmount || 0;
  if (toPaise(paid) > toPaise(grand)) throw new HttpError(400, 'Paid amount cannot exceed the purchase total.');
  const purchase = await Purchase.create({
    businessId,
    number,
    supplierId: supplierDoc._id,
    supplierSnapshot: snapshotSupplier(supplierDoc),
    supplierInvoice: input.supplierInvoice.trim(),
    purchaseDateKey: input.purchaseDate,
    dueDateKey: input.dueDate || '',
    status: toPaise(grand) === 0 ? 'paid' : toPaise(paid) <= 0 ? 'unpaid' : toPaise(paid) < toPaise(grand) ? 'partial' : 'paid',
    paymentMethod: input.paymentMethod,
    placeOfSupply: { state: business.state, stateCode: business.stateCode },
    supplyType: totals.supplyType,
    items,
    totals: {
      taxableAmount: totals.taxableAmount,
      cgst: totals.cgst,
      sgst: totals.sgst,
      igst: totals.igst,
      taxAmount: totals.taxAmount,
      roundOff: totals.roundOff,
      grandTotal: grand,
    },
    amountPaid: fromPaise(toPaise(paid)),
    amountDue: fromPaise(Math.max(0, toPaise(grand) - toPaise(paid))),
    notes: input.notes || '',
    payments: toPaise(paid) > 0 ? [{ amount: fromPaise(toPaise(paid)), method: input.paymentMethod, paidAtKey: input.purchaseDate, reference: '', notes: '' }] : [],
  });
  try {
    await commitStock(
      businessId,
      items.filter((item) => item.productId).map((item) => ({
        productId: String(item.productId),
        quantity: item.quantity,
        direction: 'in' as const,
        type: 'purchase' as const,
        reference: number,
        dateKey: input.purchaseDate,
      })),
    );
    for (const item of items) {
      if (!item.productId) continue;
      await Product.updateOne({ _id: item.productId, businessId }, { $set: { purchasePrice: item.purchasePrice } });
    }
  } catch (error) {
    await Purchase.deleteOne({ _id: purchase._id });
    throw error;
  }
  return purchase;
}

export async function payPurchase(businessId: string, purchaseId: string, amount: number, method: string, paidAt: string, reference = '') {
  const purchase = await Purchase.findOne({ _id: purchaseId, businessId });
  if (!purchase) throw new HttpError(404, 'Purchase not found.');
  if (purchase.status === 'cancelled') throw new HttpError(400, 'Cancelled purchases cannot take a payment.');
  if (toPaise(amount) > toPaise(purchase.amountDue)) throw new HttpError(400, 'That is more than the balance.');
  purchase.payments.push({ amount, method, reference, paidAtKey: paidAt, notes: '' });
  const paid = purchase.payments.reduce((sum, row) => sum + toPaise(row.amount || 0), 0);
  const total = toPaise(purchase.totals.grandTotal || 0);
  purchase.amountPaid = fromPaise(paid);
  purchase.amountDue = fromPaise(Math.max(0, total - paid));
  purchase.status = paid <= 0 ? 'unpaid' : paid < total ? 'partial' : 'paid';
  await purchase.save();
  return purchase;
}

export async function cancelPurchase(businessId: string, purchaseId: string) {
  const purchase = await Purchase.findOne({ _id: purchaseId, businessId });
  if (!purchase) throw new HttpError(404, 'Purchase not found.');
  if (purchase.status === 'cancelled') throw new HttpError(400, 'This purchase is already cancelled.');
  await commitStock(
    businessId,
    purchase.items.filter((item) => item.productId).map((item) => ({
      productId: String(item.productId),
      quantity: item.quantity,
      direction: 'out' as const,
      type: 'adjustment' as const,
      reference: `${purchase.number} cancelled`,
      dateKey: todayKey('Asia/Kolkata'),
      note: 'Purchase cancelled',
    })),
  );
  purchase.status = 'cancelled';
  purchase.amountDue = 0;
  await purchase.save();
  return purchase;
}

export async function ensureExpenseCategories(businessId: string) {
  const count = await ExpenseCategory.countDocuments({ businessId });
  if (count > 0) return ExpenseCategory.find({ businessId }).sort({ name: 1 });
  await ExpenseCategory.insertMany(EXPENSE_DEFAULTS.map((name) => ({ businessId, name })));
  return ExpenseCategory.find({ businessId }).sort({ name: 1 });
}

export async function storeDocument(businessId: string, file: Express.Multer.File, module: string, recordId: string, replaceId?: string) {
  const relative = path.posix.join(businessId, 'private', path.basename(file.filename));
  if (replaceId) {
    const previous = await DocumentFile.findOne({ _id: replaceId, businessId, recordId });
    if (!previous) throw new HttpError(404, 'Document not found.');
    await removeUpload(previous.path);
    previous.name = file.originalname;
    previous.originalName = file.originalname;
    previous.mime = file.mimetype;
    previous.size = file.size;
    previous.path = relative;
    await previous.save();
    return previous;
  }
  return DocumentFile.create({
    businessId,
    name: file.originalname,
    originalName: file.originalname,
    mime: file.mimetype,
    size: file.size,
    path: relative,
    module,
    recordId,
  });
}

export async function documentAbsPath(businessId: string, id: string) {
  const doc = await DocumentFile.findOne({ _id: id, businessId });
  if (!doc) throw new HttpError(404, 'Document not found.');
  const abs = path.join(uploadsDir, doc.path);
  if (!abs.startsWith(uploadsDir) || !fs.existsSync(abs)) throw new HttpError(404, 'File is missing.');
  return { doc, abs };
}

export function presentDocument(doc: { _id: unknown; name: string; mime: string; size: number; module: string; recordId: unknown; createdAt?: Date; originalName?: string }) {
  return {
    id: String(doc._id),
    name: doc.originalName || doc.name,
    mime: doc.mime,
    size: doc.size,
    module: doc.module,
    recordId: String(doc.recordId),
    uploadedAt: doc.createdAt,
    fileType: doc.mime === 'application/pdf' ? 'PDF' : 'Image',
  };
}

export function presentPurchase(purchase: {
  _id: unknown;
  number: string;
  supplierInvoice?: string;
  purchaseDateKey: string;
  dueDateKey?: string;
  status: string;
  paymentMethod?: string;
  supplierSnapshot?: { name?: string; company?: string; gstin?: string };
  supplierId?: unknown;
  totals?: { grandTotal?: number; taxableAmount?: number; cgst?: number; sgst?: number; igst?: number; taxAmount?: number };
  amountPaid?: number;
  amountDue?: number;
  items?: unknown[];
  notes?: string;
  payments?: unknown[];
  supplyType?: string;
}) {
  return {
    id: String(purchase._id),
    number: purchase.number,
    supplierInvoice: purchase.supplierInvoice || '',
    purchaseDate: purchase.purchaseDateKey,
    dueDate: purchase.dueDateKey || '',
    status: purchase.status,
    paymentMethod: purchase.paymentMethod || '',
    supplierId: purchase.supplierId ? String(purchase.supplierId) : '',
    supplier: purchase.supplierSnapshot || {},
    totals: purchase.totals || {},
    amountPaid: purchase.amountPaid || 0,
    amountDue: purchase.amountDue || 0,
    items: purchase.items || [],
    notes: purchase.notes || '',
    payments: purchase.payments || [],
    supplyType: purchase.supplyType || 'non_gst',
  };
}


export async function catalogProducts(businessId: string, query: {
  category?: string;
  brand?: string;
  q?: string;
  minPrice?: number;
  maxPrice?: number;
  activeOnly?: boolean;
  wholesaleOnly?: boolean;
  priceMode?: 'retail' | 'wholesale' | '';
  ids?: string[];
}) {
  const filter: Record<string, unknown> = { businessId, archived: { $ne: true } };
  if (query.activeOnly !== false) filter.status = { $ne: 'inactive' };
  if (query.category) filter.category = query.category;
  if (query.brand) filter.brand = query.brand;
  if (query.wholesaleOnly || query.priceMode === 'wholesale') filter.wholesalePrice = { $ne: null };
  if (query.ids?.length) filter._id = { $in: query.ids };
  if (query.minPrice != null || query.maxPrice != null) {
    filter.sellingPrice = {
      ...(query.minPrice != null ? { $gte: query.minPrice } : {}),
      ...(query.maxPrice != null ? { $lte: query.maxPrice } : {}),
    };
  }
  if (query.q) filter.name = new RegExp(query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  return Product.find(filter).sort({ category: 1, name: 1 }).limit(80);
}

export async function renderCatalogHtml(businessId: string, products: { name: string; sku?: string; description?: string; specifications?: { label?: string; value?: string }[]; sellingPrice: number; wholesalePrice?: number | null; gstRate?: number; hsnSac?: string; unit?: string; images?: { path?: string }[]; brand?: string; category?: string }[], autoPrint = false, priceMode?: 'retail' | 'wholesale' | '') {
  const business = await Business.findById(businessId);
  const settings = await BusinessSettings.findOne({ businessId });
  if (!business) throw new HttpError(404, 'Business profile not found.');
  const showRetail = priceMode === 'wholesale' ? false : priceMode === 'retail' ? true : settings?.catalog?.showRetail !== false;
  const showWholesale = priceMode === 'retail' ? false : priceMode === 'wholesale' ? true : settings?.catalog?.showWholesale !== false;
  const showGst = Boolean(settings?.catalog?.showGst);
  const layout = settings?.catalog?.layout === 'list' ? 'list' : 'grid';
  const perPage = Math.min(12, Math.max(1, Number(settings?.catalog?.perPage) || 6));
  const logo = (await readDataUrl(business.logoPath || '')) || (await brandLogoDataUrl());
  const mark = `<img src="${logo}" alt="KS Sports"/>`;
  const cards = await Promise.all(
    products.map(async (product) => {
      const photo = product.images?.[0]?.path ? await readDataUrl(product.images[0].path) : '';
      const specs = (product.specifications || []).filter((row) => row.label && row.value).map((row) => `<div>${escapeHtml(row.label || '')}: ${escapeHtml(row.value || '')}</div>`).join('');
      return `<article class="card">
        <div class="photo">${photo ? `<img src="${photo}" alt=""/>` : '<div class="ph">KS</div>'}</div>
        <h2>${escapeHtml(product.name)}</h2>
        <p class="sku">${product.sku ? `SKU: ${escapeHtml(product.sku)}` : ''}${product.brand ? ` · ${escapeHtml(product.brand)}` : ''}</p>
        ${product.description ? `<p class="desc">${escapeHtml(product.description)}</p>` : ''}
        <div class="specs">${specs}</div>
        ${showRetail ? `<p class="price">Retail price: ₹${format(product.sellingPrice)}</p>` : ''}
        ${showWholesale && product.wholesalePrice != null ? `<p class="price">Wholesale price: ₹${format(product.wholesalePrice)}</p>` : ''}
        ${showGst ? `<p class="fine">GST ${product.gstRate || 0}%${product.hsnSac ? ` · HSN/SAC ${escapeHtml(product.hsnSac)}` : ''}</p>` : ''}
      </article>`;
    }),
  );
  const address = [business.address?.line1, business.address?.city, business.state, business.pincode].filter(Boolean).join(', ');
  return `<!doctype html><html><head><meta charset="utf-8"><title>KS Sports catalog</title>
    <style>
      @page { size: A4; margin: 12mm; }
      body { margin: 0; font-family: Inter, "Liberation Sans", sans-serif; color: #1c1915; }
      header { display: flex; gap: 16px; align-items: center; border-bottom: 3px solid #1d6b58; padding-bottom: 12px; margin-bottom: 16px; }
      header img { width: 92px; height: 92px; object-fit: cover; border-radius: 50%; }
      h1 { font-family: Georgia, serif; margin: 0; font-size: 32px; letter-spacing: 0.04em; }
      .tag { margin: 2px 0 0; color: #6f675e; }
      .grid { display: grid; grid-template-columns: ${layout === 'list' ? '1fr' : '1fr 1fr'}; gap: 12px; }
      .page { break-after: page; }
      .page:last-child { break-after: auto; }
      .card { break-inside: avoid; border: 1px solid #e4dccf; border-radius: 12px; padding: 12px; }
      .photo { height: 140px; background: #f3efe6; border-radius: 8px; display: grid; place-items: center; overflow: hidden; }
      .photo img { width: 100%; height: 100%; object-fit: cover; }
      .ph { font-family: Georgia, serif; color: #1d6b58; font-size: 28px; }
      h2 { font-size: 16px; margin: 8px 0 2px; }
      .sku, .fine, .desc, .specs { font-size: 12px; color: #6f675e; margin: 0; }
      .price { margin: 6px 0 0; font-weight: 700; }
      .price.alt { font-weight: 600; color: #1d6b58; }
      @media print { .grid { grid-template-columns: ${layout === 'list' ? '1fr' : '1fr 1fr'}; } }
    </style></head><body>
    <header>${mark}<div><h1>KS SPORTS</h1><p class="tag">${priceMode === 'wholesale' ? 'Wholesale price list' : priceMode === 'retail' ? 'Retail price list' : 'Sports Equipment &amp; Accessories'}</p><p class="tag">${escapeHtml(business.name)} · ${escapeHtml(address)}</p><p class="tag">${escapeHtml(business.mobile || '')}${business.email ? ` · ${escapeHtml(business.email)}` : ''}${business.gstin ? ` · GSTIN ${escapeHtml(business.gstin)}` : ''}</p></div></header>
    ${
      cards.length
        ? Array.from({ length: Math.ceil(cards.length / perPage) }, (_, index) => `<section class="page grid">${cards.slice(index * perPage, index * perPage + perPage).join('')}</section>`).join('')
        : '<p>No products match this catalog.</p>'
    }
    ${autoPrint ? '<script>window.addEventListener("load", () => setTimeout(() => window.print(), 200));</script>' : ''}
    </body></html>`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char] || char);
}

function format(value: number) {
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value || 0);
}

export async function lineProfit(businessId: string, items: { productId?: unknown; quantity: number; taxableAmount?: number; total?: number; name?: string }[]) {
  const ids = items.map((item) => item.productId).filter(Boolean);
  const products = await Product.find({ _id: { $in: ids }, businessId });
  const byId = new Map(products.map((product) => [String(product._id), product]));
  let knownCost = 0;
  let knownRevenue = 0;
  let unavailable = false;
  const lines = items.map((item) => {
    const product = item.productId ? byId.get(String(item.productId)) : undefined;
    const snapped = (item as { unitCost?: number | null }).unitCost;
    const cost = snapped != null ? snapped : product && product.purchasePrice != null ? product.purchasePrice : null;
    if (cost == null) {
      unavailable = true;
      return { name: item.name || product?.name || '', quantity: item.quantity, cost: null, profit: null };
    }
    const revenue = item.taxableAmount ?? item.total ?? 0;
    const lineCost = Math.round(cost * item.quantity * 100) / 100;
    knownCost += lineCost;
    knownRevenue += revenue;
    return { name: item.name || '', quantity: item.quantity, cost: lineCost, profit: Math.round((revenue - lineCost) * 100) / 100 };
  });
  return {
    lines,
    knownCost: Math.round(knownCost * 100) / 100,
    knownRevenue: Math.round(knownRevenue * 100) / 100,
    grossProfit: unavailable && knownCost === 0 ? null : Math.round((knownRevenue - knownCost) * 100) / 100,
    costUnavailable: unavailable,
  };
}

export async function productActivity(businessId: string, productId: string) {
  const product = await Product.findOne({ _id: productId, businessId });
  if (!product) throw new HttpError(404, 'Product not found.');
  const [sales, purchases, movements] = await Promise.all([
    Invoice.find({ businessId, 'items.productId': product._id, status: { $ne: 'draft' } }).sort({ invoiceDateKey: -1 }).limit(30),
    Purchase.find({ businessId, 'items.productId': product._id }).sort({ purchaseDateKey: -1 }).limit(30),
    StockMovement.find({ businessId, productId: product._id }).sort({ dateKey: -1, createdAt: -1 }).limit(50),
  ]);
  return {
    sales: sales.map((invoice) => ({
      id: String(invoice._id),
      number: invoice.number,
      date: invoice.invoiceDateKey,
      customer: invoice.customerSnapshot?.name || '',
      quantity: invoice.items.filter((item) => String(item.productId) === String(product._id)).reduce((sum, item) => sum + item.quantity, 0),
      total: invoice.totals.grandTotal,
      status: invoice.status,
    })),
    purchases: purchases.map((purchase) => ({
      id: String(purchase._id),
      number: purchase.number,
      date: purchase.purchaseDateKey,
      supplier: purchase.supplierSnapshot?.name || '',
      quantity: purchase.items.filter((item) => String(item.productId) === String(product._id)).reduce((sum, item) => sum + item.quantity, 0),
      total: purchase.totals?.grandTotal || 0,
    })),
    movements: movements.map((row) => ({
      id: String(row._id),
      date: row.dateKey,
      type: row.type,
      reference: row.reference,
      qtyIn: row.qtyIn,
      qtyOut: row.qtyOut,
      balance: row.balance,
    })),
  };
}

export async function maintenanceDue(businessId: string, today: string) {
  return MachineMaintenance.find({ businessId, nextDateKey: { $gte: today, $ne: '' } }).sort({ nextDateKey: 1 }).limit(6);
}

export async function expenseTotal(businessId: string, from?: string, to?: string) {
  const rows = await Expense.find({
    businessId,
    archived: { $ne: true },
    ...(from || to ? { dateKey: { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) } } : {}),
  });
  return Math.round(rows.reduce((sum, row) => sum + row.amount, 0) * 100) / 100;
}
