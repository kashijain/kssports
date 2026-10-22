import { Router } from 'express';
import { z } from 'zod';
import { statusLabel } from '../domain/constants.js';
import { todayKey } from '../domain/dates.js';
import { asyncHandler, HttpError } from '../http.js';
import { requireAuth, requireBusiness } from '../middleware/auth.js';
import {
  Business,
  BusinessSettings,
  DocumentFile,
  Expense,
  ExpenseCategory,
  Invoice,
  Machine,
  MachineMaintenance,
  Purchase,
  Supplier,
} from '../models.js';
import { presentInvoiceListItem } from '../present.js';
import { discardRejectedUpload, documentUpload, publicAssetUrl, removeUpload, storedPublicImage, upload } from '../services/files.js';
import { withPdf } from '../services/pdf.js';
import { purchaseRegisterPdf, renderCatalogPdf } from '../services/shopPdf.js';
import { toCsv } from '../services/reports.js';
import {
  cancelPurchase,
  catalogProducts,
  createPurchase,
  loadDocument,
  ensureExpenseCategories,
  lineProfit,
  listCategories,
  payPurchase,
  presentDocument,
  presentPurchase,
  renderCatalogHtml,
  saveCategory,
  saveSupplier,
  storeDocument,
} from '../services/operations.js';
import { escapeRegex, pageQuery } from '../util.js';
import { parseBody } from '../validate.js';

export const opsRouter = Router();
opsRouter.use(requireAuth, requireBusiness);

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

opsRouter.get(
  '/categories',
  asyncHandler(async (req, res) => {
    const rows = await listCategories(req.auth!.businessId!);
    res.json({ categories: rows.map((row) => ({ id: String(row._id), name: row.name, parentId: row.parentId ? String(row.parentId) : '' })) });
  }),
);

opsRouter.post(
  '/categories',
  asyncHandler(async (req, res) => {
    const body = parseBody(z.object({ name: z.string().min(1), parentId: z.string().optional() }), req.body);
    const row = await saveCategory(req.auth!.businessId!, body.name, body.parentId);
    res.status(201).json({ category: { id: String(row._id), name: row.name, parentId: row.parentId ? String(row.parentId) : '' } });
  }),
);

opsRouter.delete(
  '/categories/:id',
  asyncHandler(async (req, res) => {
    const row = await (await import('../models.js')).Category.findOneAndDelete({ _id: req.params.id, businessId: req.auth!.businessId });
    if (!row) throw new HttpError(404, 'Category not found.');
    res.json({ ok: true });
  }),
);

opsRouter.get(
  '/suppliers',
  asyncHandler(async (req, res) => {
    const q = String(req.query.q || '').trim();
    const filter: Record<string, unknown> = { businessId: req.auth!.businessId, archived: { $ne: true } };
    if (q) filter.name = new RegExp(escapeRegex(q), 'i');
    const rows = await Supplier.find(filter).sort({ name: 1 }).limit(100);
    res.json({ suppliers: rows.map(presentSupplier) });
  }),
);

opsRouter.post(
  '/suppliers',
  asyncHandler(async (req, res) => {
    const row = await saveSupplier(req.auth!.businessId!, req.body || {});
    res.status(201).json({ supplier: presentSupplier(row) });
  }),
);

opsRouter.put(
  '/suppliers/:id',
  asyncHandler(async (req, res) => {
    const row = await saveSupplier(req.auth!.businessId!, req.body || {}, req.params.id);
    res.json({ supplier: presentSupplier(row) });
  }),
);

const purchaseSchema = z.object({
  supplierId: z.string().optional(),
  supplier: z.record(z.string()).optional(),
  supplierInvoice: z.string().trim().min(1, 'Enter the supplier invoice number.'),
  purchaseDate: dateKey,
  dueDate: z.string().optional().default(''),
  status: z.enum(['unpaid', 'partial', 'paid']).default('unpaid'),
  paymentMethod: z.enum(['cash', 'upi', 'bank_transfer', 'card', 'cheque', 'other']).default('bank_transfer'),
  paidAmount: z.number().min(0).optional(),
  notes: z.string().optional().default(''),
  items: z
    .array(
      z.object({
        productId: z.string().nullable().optional(),
        name: z.string().min(1),
        sku: z.string().optional().default(''),
        quantity: z.number().positive(),
        purchasePrice: z.number().min(0),
        discountMode: z.enum(['amount', 'percent']).optional(),
        discountValue: z.number().min(0).optional(),
        gstRate: z.number().min(0).max(100).optional(),
      }),
    )
    .min(1),
});

opsRouter.get(
  '/purchases',
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = pageQuery(req.query);
    const filter: Record<string, unknown> = { businessId: req.auth!.businessId };
    if (req.query.supplierId) filter.supplierId = String(req.query.supplierId);
    if (req.query.status) filter.status = String(req.query.status);
    const q = String(req.query.q || '').trim();
    if (q) {
      const rx = new RegExp(escapeRegex(q), 'i');
      filter.$or = [{ number: rx }, { supplierInvoice: rx }, { 'supplierSnapshot.name': rx }];
    }
    const [rows, total] = await Promise.all([
      Purchase.find(filter).sort({ purchaseDateKey: -1 }).skip(skip).limit(limit),
      Purchase.countDocuments(filter),
    ]);
    const purchases = await Promise.all(rows.map(async (row) => ({ ...presentPurchase(row), documents: await docsFor(req.auth!.businessId!, row._id) })));
    res.json({ purchases, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
  }),
);

opsRouter.post(
  '/purchases',
  asyncHandler(async (req, res) => {
    const body = parseBody(purchaseSchema, req.body);
    const purchase = await createPurchase(req.auth!.businessId!, body as never);
    res.status(201).json({ purchase: presentPurchase(purchase) });
  }),
);

opsRouter.get(
  '/purchases/download',
  asyncHandler(async (req, res) => {
    const rows = await Purchase.find({ businessId: req.auth!.businessId }).sort({ purchaseDateKey: 1, number: 1 });
    const business = await Business.findById(req.auth!.businessId);
    const list = rows.map((row) => ({
      number: row.number,
      supplier: row.supplierSnapshot?.name || row.supplierSnapshot?.company || '',
      invoice: row.supplierInvoice || '',
      date: row.purchaseDateKey,
      total: row.totals?.grandTotal || 0,
      due: row.amountDue || 0,
      status: statusLabel(row.status),
    }));
    const format = String(req.query.format || 'pdf');
    if (format === 'csv') {
      const csv = toCsv(
        ['Purchase', 'Supplier', 'Their invoice', 'Date', 'Total', 'Due', 'Status'],
        [
          ...list.map((row) => [row.number, row.supplier, row.invoice, row.date, row.total, row.due, row.status]),
          ['', '', '', 'Total', list.reduce((sum, row) => sum + row.total, 0), list.reduce((sum, row) => sum + row.due, 0), ''],
        ],
      );
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="ks-sports-wholesale-purchases.csv"');
      res.send(csv);
      return;
    }
    const pdf = await purchaseRegisterPdf(business?.name || 'KS Sports', list);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="ks-sports-wholesale-purchases.pdf"');
    res.send(pdf);
  }),
);

opsRouter.get(
  '/purchases/:id',
  asyncHandler(async (req, res) => {
    const purchase = await Purchase.findOne({ _id: req.params.id, businessId: req.auth!.businessId });
    if (!purchase) throw new HttpError(404, 'Purchase not found.');
    res.json({ purchase: presentPurchase(purchase), documents: await docsFor(req.auth!.businessId!, purchase._id) });
  }),
);

opsRouter.post(
  '/purchases/:id/payments',
  asyncHandler(async (req, res) => {
    const body = parseBody(z.object({ amount: z.number().positive(), method: z.string().min(1), paidAt: dateKey, reference: z.string().optional() }), req.body);
    const purchase = await payPurchase(req.auth!.businessId!, req.params.id, body.amount, body.method, body.paidAt, body.reference);
    res.json({ purchase: presentPurchase(purchase) });
  }),
);

opsRouter.post(
  '/purchases/:id/cancel',
  asyncHandler(async (req, res) => {
    const purchase = await cancelPurchase(req.auth!.businessId!, req.params.id);
    res.json({ purchase: presentPurchase(purchase) });
  }),
);

opsRouter.post(
  '/purchases/:id/bill',
  documentUpload.single('file'),
  asyncHandler(async (req, res) => {
    const purchase = await Purchase.findOne({ _id: req.params.id, businessId: req.auth!.businessId });
    if (!purchase) throw new HttpError(404, 'Purchase not found.');
    if (!req.file) throw new HttpError(400, 'Choose the supplier bill.');
    const doc = await storeDocument(req.auth!.businessId!, req.file, 'purchase', String(purchase._id), req.body?.replaceId);
    res.status(201).json({ document: presentDocument(doc) });
  }),
);

opsRouter.get(
  '/sales',
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = pageQuery(req.query);
    const filter: Record<string, unknown> = { businessId: req.auth!.businessId, status: { $ne: 'draft' } };
    const [invoices, total] = await Promise.all([
      Invoice.find(filter).sort({ invoiceDateKey: -1 }).skip(skip).limit(limit),
      Invoice.countDocuments(filter),
    ]);
    const sales = await Promise.all(
      invoices.map(async (invoice) => {
        const profit = await lineProfit(req.auth!.businessId!, invoice.items);
        return {
          ...presentInvoiceListItem(invoice),
          items: invoice.items.map((item) => ({ name: item.name, quantity: item.quantity })),
          gst: invoice.totals.taxAmount,
          grossProfit: profit.grossProfit,
          costUnavailable: profit.costUnavailable,
        };
      }),
    );
    res.json({ sales, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
  }),
);

opsRouter.post(
  '/catalog/preview',
  asyncHandler(async (req, res) => {
    const query = catalogQuery(req.body || {});
    const products = await catalogProducts(req.auth!.businessId!, query);
    res.type('html').send(await renderCatalogHtml(req.auth!.businessId!, products, false, query.priceMode));
  }),
);

opsRouter.get(
  '/catalog/pdf',
  asyncHandler(async (req, res) => {
    const query = catalogQuery(req.query as Record<string, unknown>);
    const products = await catalogProducts(req.auth!.businessId!, query);
    const pdf = await withPdf(
      () => renderCatalogHtml(req.auth!.businessId!, products, false, query.priceMode),
      () => renderCatalogPdf(req.auth!.businessId!, products, query.priceMode),
    );
    const filename = query.priceMode === 'wholesale' ? 'ks-sports-wholesale-catalog.pdf' : query.priceMode === 'retail' ? 'ks-sports-retail-catalog.pdf' : 'ks-sports-catalog.pdf';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdf);
  }),
);

opsRouter.get(
  '/catalog/html',
  asyncHandler(async (req, res) => {
    const query = catalogQuery(req.query as Record<string, unknown>);
    const products = await catalogProducts(req.auth!.businessId!, query);
    res.type('html').send(await renderCatalogHtml(req.auth!.businessId!, products, req.query.print === '1', query.priceMode));
  }),
);

const machineSchema = z.object({
  name: z.string().min(1),
  machineType: z.string().optional().default(''),
  machineCode: z.string().optional().default(''),
  brand: z.string().optional().default(''),
  model: z.string().optional().default(''),
  serialNumber: z.string().optional().default(''),
  purchaseDateKey: z.string().optional().default(''),
  purchasePrice: z.number().min(0).optional().default(0),
  supplierName: z.string().optional().default(''),
  warrantyStart: z.string().optional().default(''),
  warrantyEnd: z.string().optional().default(''),
  installationDate: z.string().optional().default(''),
  status: z.enum(['active', 'maintenance', 'inactive', 'sold']).optional().default('active'),
  location: z.string().optional().default(''),
  notes: z.string().optional().default(''),
});

opsRouter.get(
  '/machines',
  asyncHandler(async (req, res) => {
    const rows = await Machine.find({ businessId: req.auth!.businessId, archived: { $ne: true } }).sort({ name: 1 });
    const machines = await Promise.all(rows.map(async (row) => ({ ...presentMachine(row), maintenanceCost: await maintenanceCost(row._id) })));
    res.json({ machines });
  }),
);

opsRouter.post(
  '/machines',
  asyncHandler(async (req, res) => {
    const body = parseBody(machineSchema, req.body);
    const row = await Machine.create({ businessId: req.auth!.businessId, ...body });
    res.status(201).json({ machine: presentMachine(row) });
  }),
);

opsRouter.get(
  '/machines/:id',
  asyncHandler(async (req, res) => {
    const row = await Machine.findOne({ _id: req.params.id, businessId: req.auth!.businessId });
    if (!row) throw new HttpError(404, 'Machine not found.');
    const history = await MachineMaintenance.find({ machineId: row._id }).sort({ dateKey: -1 });
    res.json({
      machine: presentMachine(row),
      maintenance: await Promise.all(history.map(async (item) => ({ ...presentMaintenance(item), documents: await docsFor(req.auth!.businessId!, item._id) }))),
      maintenanceCost: history.reduce((sum, item) => sum + item.cost, 0),
      documents: await docsFor(req.auth!.businessId!, row._id),
    });
  }),
);

opsRouter.put(
  '/machines/:id',
  asyncHandler(async (req, res) => {
    const body = parseBody(machineSchema, req.body);
    const row = await Machine.findOneAndUpdate({ _id: req.params.id, businessId: req.auth!.businessId }, body, { new: true });
    if (!row) throw new HttpError(404, 'Machine not found.');
    res.json({ machine: presentMachine(row) });
  }),
);

opsRouter.post(
  '/machines/:id/maintenance',
  asyncHandler(async (req, res) => {
    const body = parseBody(
      z.object({
        dateKey: dateKey,
        maintenanceType: z.string().min(1),
        vendor: z.string().optional().default(''),
        cost: z.number().min(0).default(0),
        description: z.string().optional().default(''),
        nextDateKey: z.string().optional().default(''),
      }),
      req.body,
    );
    const machine = await Machine.findOne({ _id: req.params.id, businessId: req.auth!.businessId });
    if (!machine) throw new HttpError(404, 'Machine not found.');
    const row = await MachineMaintenance.create({ businessId: req.auth!.businessId, machineId: machine._id, ...body });
    res.status(201).json({ maintenance: presentMaintenance(row) });
  }),
);

opsRouter.post(
  '/machines/:id/photo',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const machine = await Machine.findOne({ _id: req.params.id, businessId: req.auth!.businessId });
    if (!machine || !req.file) throw new HttpError(400, 'Choose a machine photo.');
    const previous = machine.photoPath || '';
    machine.photoPath = await storedPublicImage(req.file, req.auth!.businessId!, 'machines');
    await machine.save();
    if (previous && previous !== machine.photoPath) await removeUpload(previous);
    res.json({ machine: presentMachine(machine) });
  }),
);

opsRouter.get(
  '/expenses/categories',
  asyncHandler(async (req, res) => {
    const rows = await ensureExpenseCategories(req.auth!.businessId!);
    res.json({ categories: rows.map((row) => ({ id: String(row._id), name: row.name })) });
  }),
);

opsRouter.post(
  '/expenses/categories',
  asyncHandler(async (req, res) => {
    const body = parseBody(z.object({ name: z.string().min(1) }), req.body);
    try {
      const row = await ExpenseCategory.create({ businessId: req.auth!.businessId, name: body.name.trim() });
      res.status(201).json({ category: { id: String(row._id), name: row.name } });
    } catch {
      throw new HttpError(409, 'That category already exists.');
    }
  }),
);

opsRouter.get(
  '/expenses',
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = pageQuery(req.query);
    const filter: Record<string, unknown> = { businessId: req.auth!.businessId, archived: { $ne: true } };
    if (req.query.category) filter.category = String(req.query.category);
    const [rows, total] = await Promise.all([
      Expense.find(filter).sort({ dateKey: -1 }).skip(skip).limit(limit),
      Expense.countDocuments(filter),
    ]);
    res.json({
      expenses: await Promise.all(rows.map(async (row) => ({ ...presentExpense(row), documents: await docsFor(req.auth!.businessId!, row._id) }))),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
    });
  }),
);

opsRouter.post(
  '/expenses',
  asyncHandler(async (req, res) => {
    const body = parseBody(
      z.object({
        name: z.string().min(1),
        category: z.string().min(1),
        amount: z.number().positive(),
        dateKey: dateKey,
        method: z.string().optional().default('cash'),
        vendor: z.string().optional().default(''),
        notes: z.string().optional().default(''),
      }),
      req.body,
    );
    const row = await Expense.create({ businessId: req.auth!.businessId, ...body });
    res.status(201).json({ expense: presentExpense(row) });
  }),
);

opsRouter.delete(
  '/expenses/:id',
  asyncHandler(async (req, res) => {
    const row = await Expense.findOneAndUpdate({ _id: req.params.id, businessId: req.auth!.businessId }, { archived: true });
    if (!row) throw new HttpError(404, 'Expense not found.');
    res.json({ ok: true });
  }),
);

opsRouter.get(
  '/documents',
  asyncHandler(async (req, res) => {
    const filter: Record<string, unknown> = { businessId: req.auth!.businessId };
    if (req.query.module) filter.module = String(req.query.module);
    if (req.query.recordId) filter.recordId = String(req.query.recordId);
    if (req.query.fileType === 'pdf') filter.mime = 'application/pdf';
    if (req.query.fileType === 'image') filter.mime = { $in: ['image/jpeg', 'image/png'] };
    const q = String(req.query.q || '').trim();
    if (q) filter.originalName = new RegExp(escapeRegex(q), 'i');
    if (req.query.from || req.query.to) {
      const createdAt: Record<string, Date> = {};
      if (req.query.from) createdAt.$gte = new Date(`${String(req.query.from)}T00:00:00.000+05:30`);
      if (req.query.to) createdAt.$lte = new Date(`${String(req.query.to)}T23:59:59.999+05:30`);
      filter.createdAt = createdAt;
    }
    let rows = await DocumentFile.find(filter).sort({ createdAt: -1 }).limit(200);
    if (req.query.supplier || req.query.invoice) {
      const purchaseFilter: Record<string, unknown> = { businessId: req.auth!.businessId };
      if (req.query.supplier) purchaseFilter['supplierSnapshot.name'] = new RegExp(escapeRegex(String(req.query.supplier)), 'i');
      if (req.query.invoice) purchaseFilter.supplierInvoice = new RegExp(escapeRegex(String(req.query.invoice)), 'i');
      const purchases = await Purchase.find(purchaseFilter);
      const ids = new Set(purchases.map((row) => String(row._id)));
      rows = rows.filter((row) => row.module === 'purchase' && ids.has(String(row.recordId)));
    }
    res.json({ documents: rows.map(presentDocument) });
  }),
);

opsRouter.post(
  '/documents',
  documentUpload.single('file'),
  asyncHandler(async (req, res) => {
    const moduleName = String(req.body?.module || '');
    const recordId = String(req.body?.recordId || '');
    if (!moduleName || !recordId || !req.file) throw new HttpError(400, 'Choose a file and the record it belongs to.');
    await assertRecord(req.auth!.businessId!, moduleName, recordId);
    const settings = await BusinessSettings.findOne({ businessId: req.auth!.businessId });
    const max = (settings?.documents?.maxUploadMb || 8) * 1024 * 1024;
    if (req.file.size > max) {
      await discardRejectedUpload(req.file, req.auth!.businessId!);
      throw new HttpError(400, `File is larger than ${settings?.documents?.maxUploadMb || 8} MB.`);
    }
    const doc = await storeDocument(req.auth!.businessId!, req.file, moduleName, recordId, req.body?.replaceId);
    res.status(201).json({ document: presentDocument(doc) });
  }),
);

opsRouter.get(
  '/documents/:id/file',
  asyncHandler(async (req, res) => {
    const { doc, body } = await loadDocument(req.auth!.businessId!, req.params.id);
    res.setHeader('Content-Type', doc.mime);
    res.setHeader('Content-Disposition', `${req.query.download === '1' ? 'attachment' : 'inline'}; filename="${doc.originalName}"`);
    res.send(body);
  }),
);

opsRouter.delete(
  '/documents/:id',
  asyncHandler(async (req, res) => {
    const doc = await DocumentFile.findOne({ _id: req.params.id, businessId: req.auth!.businessId });
    if (!doc) throw new HttpError(404, 'Document not found.');
    await removeUpload(doc.path);
    await doc.deleteOne();
    res.json({ ok: true });
  }),
);

function catalogQuery(source: Record<string, unknown>) {
  const ids = String(source.ids || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  return {
    category: source.category ? String(source.category) : '',
    brand: source.brand ? String(source.brand) : '',
    q: source.q ? String(source.q) : '',
    minPrice: source.minPrice === '' || source.minPrice == null ? undefined : Number(source.minPrice),
    maxPrice: source.maxPrice === '' || source.maxPrice == null ? undefined : Number(source.maxPrice),
    activeOnly: source.activeOnly !== '0' && source.activeOnly !== false,
    wholesaleOnly: source.wholesaleOnly === '1' || source.wholesaleOnly === true,
    priceMode: (source.priceMode === 'retail' || source.priceMode === 'wholesale' ? source.priceMode : '') as 'retail' | 'wholesale' | '',
    ids,
  };
}

async function docsFor(businessId: string, recordId: unknown) {
  const rows = await DocumentFile.find({ businessId, recordId }).sort({ createdAt: -1 });
  return rows.map(presentDocument);
}

async function maintenanceCost(machineId: unknown) {
  const rows = await MachineMaintenance.find({ machineId });
  return Math.round(rows.reduce((sum, row) => sum + row.cost, 0) * 100) / 100;
}

async function assertRecord(businessId: string, moduleName: string, recordId: string) {
  const { Customer, Product, Business } = await import('../models.js');
  const found =
    moduleName === 'purchase'
      ? await Purchase.exists({ _id: recordId, businessId })
      : moduleName === 'machine'
        ? await Machine.exists({ _id: recordId, businessId })
        : moduleName === 'maintenance'
          ? await MachineMaintenance.exists({ _id: recordId, businessId })
        : moduleName === 'expense'
          ? await Expense.exists({ _id: recordId, businessId })
          : moduleName === 'customer'
            ? await Customer.exists({ _id: recordId, businessId })
            : moduleName === 'product'
              ? await Product.exists({ _id: recordId, businessId })
              : moduleName === 'business'
                ? await Business.exists({ _id: recordId })
                : null;
  if (!found) throw new HttpError(404, 'That record was not found.');
}

function presentSupplier(row: { _id: unknown; name: string; company?: string; mobile?: string; email?: string; gstin?: string; state?: string; stateCode?: string; address?: unknown }) {
  return {
    id: String(row._id),
    name: row.name,
    company: row.company || '',
    mobile: row.mobile || '',
    email: row.email || '',
    gstin: row.gstin || '',
    state: row.state || '',
    stateCode: row.stateCode || '',
    address: row.address || {},
  };
}

function presentMachine(row: {
  _id: unknown;
  name: string;
  machineType?: string;
  machineCode?: string;
  brand?: string;
  model?: string;
  serialNumber?: string;
  purchaseDateKey?: string;
  purchasePrice?: number;
  supplierName?: string;
  warrantyStart?: string;
  warrantyEnd?: string;
  installationDate?: string;
  status: string;
  location?: string;
  notes?: string;
  photoPath?: string;
}) {
  return {
    id: String(row._id),
    name: row.name,
    machineType: row.machineType || '',
    machineCode: row.machineCode || '',
    brand: row.brand || '',
    model: row.model || '',
    serialNumber: row.serialNumber || '',
    purchaseDate: row.purchaseDateKey || '',
    purchasePrice: row.purchasePrice || 0,
    supplierName: row.supplierName || '',
    warrantyStart: row.warrantyStart || '',
    warrantyEnd: row.warrantyEnd || '',
    installationDate: row.installationDate || '',
    status: row.status,
    location: row.location || '',
    notes: row.notes || '',
    photoUrl: row.photoPath ? publicAssetUrl(row.photoPath) : '',
  };
}

function presentMaintenance(row: { _id: unknown; dateKey: string; maintenanceType: string; vendor?: string; cost: number; description?: string; nextDateKey?: string }) {
  return {
    id: String(row._id),
    date: row.dateKey,
    maintenanceType: row.maintenanceType,
    vendor: row.vendor || '',
    cost: row.cost,
    description: row.description || '',
    nextDate: row.nextDateKey || '',
  };
}

function presentExpense(row: { _id: unknown; name: string; category: string; amount: number; dateKey: string; method?: string; vendor?: string; notes?: string }) {
  return {
    id: String(row._id),
    name: row.name,
    category: row.category,
    amount: row.amount,
    date: row.dateKey,
    method: row.method || '',
    vendor: row.vendor || '',
    notes: row.notes || '',
  };
}
