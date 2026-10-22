import { Router } from 'express';
import { asyncHandler } from '../http.js';
import { requireAuth, requireBusiness } from '../middleware/auth.js';
import { Customer, Invoice, Product } from '../models.js';
import { htmlToPdf } from '../services/pdf.js';
import {
  customerReport,
  dashboard,
  expenseReport,
  gstReport,
  inventoryReport,
  outstandingReport,
  paymentReport,
  presets,
  productReport,
  profitReport,
  purchaseReport,
  salesReport,
  toCsv,
} from '../services/reports.js';
import { escapeRegex } from '../util.js';

export const reportRouter = Router();
reportRouter.use(requireAuth, requireBusiness);

function queryRange(req: { query: Record<string, unknown> }) {
  return {
    from: req.query.from ? String(req.query.from) : undefined,
    to: req.query.to ? String(req.query.to) : undefined,
    format: String(req.query.export || ''),
  };
}

reportRouter.get(
  '/presets',
  asyncHandler(async (req, res) => {
    res.json(await presets(req.auth!.businessId!));
  }),
);

reportRouter.get(
  '/dashboard',
  asyncHandler(async (req, res) => {
    res.json(await dashboard(req.auth!.businessId!));
  }),
);

reportRouter.get(
  '/notifications',
  asyncHandler(async (req, res) => {
    const data = await dashboard(req.auth!.businessId!);
    res.json({ notifications: data.notifications });
  }),
);

reportRouter.get(
  '/search',
  asyncHandler(async (req, res) => {
    const q = String(req.query.q || '').trim().slice(0, 80);
    if (q.length < 1) {
      res.json({ invoices: [], customers: [], products: [] });
      return;
    }
    const rx = new RegExp(escapeRegex(q), 'i');
    const businessId = req.auth!.businessId;
    const [invoices, customers, products] = await Promise.all([
      Invoice.find({ businessId, $or: [{ number: rx }, { 'customerSnapshot.name': rx }] })
        .sort({ invoiceDateKey: -1 })
        .limit(6),
      Customer.find({ businessId, archived: { $ne: true }, $or: [{ name: rx }, { mobile: rx }] })
        .sort({ name: 1 })
        .limit(6),
      Product.find({ businessId, archived: { $ne: true }, $or: [{ name: rx }, { sku: rx }] })
        .sort({ name: 1 })
        .limit(6),
    ]);
    res.json({
      invoices: invoices.map((invoice) => ({
        id: String(invoice._id),
        number: invoice.number,
        customerName: invoice.customerSnapshot?.name || '',
        href: `/invoices/${invoice._id}`,
      })),
      customers: customers.map((customer) => ({ id: String(customer._id), name: customer.name, href: `/customers/${customer._id}` })),
      products: products.map((product) => ({ id: String(product._id), name: product.name, href: '/products' })),
    });
  }),
);

async function sendReport(
  res: { type: (t: string) => { send: (b: string | Buffer) => void }; setHeader: (k: string, v: string) => void; json: (b: unknown) => void },
  format: string,
  filename: string,
  payload: unknown,
  csv: string | null,
  title: string,
) {
  if (format === 'csv' && csv) {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
    res.type('text/csv').send(csv);
    return;
  }
  if (format === 'pdf') {
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
      <style>body{font-family:Inter,sans-serif;padding:24px;color:#1c1915} table{width:100%;border-collapse:collapse} td,th{border-bottom:1px solid #e6dfd2;padding:6px;text-align:left;font-size:12px} h1{font-family:Georgia,serif}</style>
      </head><body><h1>${title}</h1><pre>${escapeHtml(JSON.stringify(payload, null, 2))}</pre></body></html>`;
    const pdf = await htmlToPdf(html);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
    res.type('application/pdf').send(pdf);
    return;
  }
  res.json(payload);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char] || char);
}

reportRouter.get(
  '/sales',
  asyncHandler(async (req, res) => {
    const { from, to, format } = queryRange(req);
    const report = await salesReport(req.auth!.businessId!, from, to);
    const csv = toCsv(
      ['Invoice', 'Date', 'Customer', 'Status', 'Taxable', 'Tax', 'Total', 'Paid', 'Due'],
      report.rows.map((row) => [row.number, row.date, row.customer, row.status, row.taxable, row.tax, row.total, row.paid, row.due]),
    );
    await sendReport(res, format, 'sales', report, csv, 'Sales report');
  }),
);

reportRouter.get(
  '/gst',
  asyncHandler(async (req, res) => {
    const { from, to, format } = queryRange(req);
    const report = await gstReport(req.auth!.businessId!, from, to);
    const csv = toCsv(
      ['HSN/SAC', 'Rate', 'Taxable', 'CGST', 'SGST', 'IGST'],
      report.rows.map((row) => [row.hsnSac, row.gstRate, row.taxable, row.cgst, row.sgst, row.igst]),
    );
    await sendReport(res, format, 'gst', report, csv, 'GST report');
  }),
);

reportRouter.get(
  '/customers',
  asyncHandler(async (req, res) => {
    const { from, to, format } = queryRange(req);
    const rows = await customerReport(req.auth!.businessId!, from, to);
    const csv = toCsv(
      ['Customer', 'Invoices', 'Total', 'Due'],
      rows.map((row) => [row.customer, row.invoices, row.total, row.due]),
    );
    await sendReport(res, format, 'customers', { rows }, csv, 'Customer sales');
  }),
);

reportRouter.get(
  '/products',
  asyncHandler(async (req, res) => {
    const { from, to, format } = queryRange(req);
    const rows = await productReport(req.auth!.businessId!, from, to);
    const csv = toCsv(
      ['Item', 'HSN/SAC', 'Unit', 'Quantity', 'Taxable', 'Total'],
      rows.map((row) => [row.name, row.hsnSac, row.unit, row.quantity, row.taxable, row.total]),
    );
    await sendReport(res, format, 'products', { rows }, csv, 'Product sales');
  }),
);

reportRouter.get(
  '/payments',
  asyncHandler(async (req, res) => {
    const { from, to, format } = queryRange(req);
    const report = await paymentReport(req.auth!.businessId!, from, to);
    const csv = toCsv(
      ['Date', 'Invoice', 'Customer', 'Method', 'Reference', 'Amount'],
      report.rows.map((row) => [row.date, row.invoice, row.customer, row.method, row.reference, row.amount]),
    );
    await sendReport(res, format, 'payments', report, csv, 'Payments');
  }),
);

reportRouter.get(
  '/outstanding',
  asyncHandler(async (req, res) => {
    const { from, to, format } = queryRange(req);
    const report = await outstandingReport(req.auth!.businessId!, from, to);
    const csv = toCsv(
      ['Invoice', 'Date', 'Due date', 'Customer', 'Status', 'Total', 'Paid', 'Due'],
      report.rows.map((row) => [row.number, row.date, row.dueDate, row.customer, row.status, row.total, row.paid, row.due]),
    );
    await sendReport(res, format, 'outstanding', report, csv, 'Outstanding');
  }),
);

reportRouter.get(
  '/purchases',
  asyncHandler(async (req, res) => {
    const { from, to, format } = queryRange(req);
    const report = await purchaseReport(req.auth!.businessId!, from, to);
    const csv = toCsv(
      ['Purchase', 'Date', 'Supplier', 'Supplier invoice', 'Total', 'Paid', 'Due'],
      report.rows.map((row) => [row.number, row.date, row.supplier, row.invoice, row.total, row.paid, row.due]),
    );
    await sendReport(res, format, 'purchases', report, csv, 'Purchase report');
  }),
);

reportRouter.get(
  '/inventory',
  asyncHandler(async (req, res) => {
    const report = await inventoryReport(req.auth!.businessId!);
    const csv = toCsv(
      ['Product', 'SKU', 'Quantity', 'Unit', 'Rate', 'Value', 'Low'],
      report.rows.map((row) => [row.name, row.sku, row.quantity, row.unit, row.rate ?? '', row.value ?? '', row.low ? 'yes' : '']),
    );
    await sendReport(res, formatFrom(req), 'inventory', report, csv, 'Inventory report');
  }),
);

reportRouter.get(
  '/profit',
  asyncHandler(async (req, res) => {
    const { from, to, format } = queryRange(req);
    const report = await profitReport(req.auth!.businessId!, from, to);
    const csv = toCsv(
      ['Revenue', 'Cost', 'Gross profit', 'Expenses', 'Net profit'],
      [[report.revenue, report.cost ?? '', report.grossProfit ?? '', report.expenses, report.netProfit ?? '']],
    );
    await sendReport(res, format, 'profit', report, csv, 'Profit report');
  }),
);

reportRouter.get(
  '/expenses',
  asyncHandler(async (req, res) => {
    const { from, to, format } = queryRange(req);
    const report = await expenseReport(req.auth!.businessId!, from, to);
    const csv = toCsv(
      ['Date', 'Name', 'Category', 'Vendor', 'Method', 'Amount'],
      report.rows.map((row) => [row.date, row.name, row.category, row.vendor, row.method, row.amount]),
    );
    await sendReport(res, format, 'expenses', report, csv, 'Expense report');
  }),
);

function formatFrom(req: { query: Record<string, unknown> }) {
  return String(req.query.export || '');
}
