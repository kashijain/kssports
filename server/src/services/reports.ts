import mongoose from 'mongoose';
import { ISSUED_STATUSES, methodLabel, statusLabel } from '../domain/constants.js';
import { eachDate, parseDateKey, reportPresets, todayKey } from '../domain/dates.js';
import { DomainError } from '../domain/errors.js';
import { HttpError } from '../http.js';
import { BusinessSettings, Customer, Expense, Invoice, Machine, MachineMaintenance, Payment, Product, Purchase, StockMovement } from '../models.js';
import { roundMoney } from '../util.js';

function id(businessId: string) {
  return new mongoose.Types.ObjectId(businessId);
}

function range(from?: string, to?: string) {
  if (from) parseDateKey(from);
  if (to) parseDateKey(to);
  if (from && to && from > to) throw new HttpError(400, 'The start date is after the end date.');
  if (!from && !to) return {};
  return { invoiceDateKey: { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) } };
}

function issuedMatch(businessId: string, from?: string, to?: string) {
  try {
    return { businessId: id(businessId), status: { $in: ISSUED_STATUSES }, ...range(from, to) };
  } catch (error) {
    if (error instanceof DomainError) throw new HttpError(400, error.message);
    throw error;
  }
}

async function sum(match: Record<string, unknown>, field: string) {
  const [row] = await Invoice.aggregate([{ $match: match }, { $group: { _id: null, total: { $sum: `$${field}` } } }]);
  return roundMoney(row?.total ?? 0);
}

export async function presets(businessId: string) {
  const settings = await BusinessSettings.findOne({ businessId });
  const today = todayKey(settings?.defaults.timezone || 'Asia/Kolkata');
  return { today, ranges: reportPresets(today, settings?.invoice.fyStartMonth || 4), timezone: settings?.defaults.timezone || 'Asia/Kolkata' };
}

export async function dashboard(businessId: string) {
  const meta = await presets(businessId);
  const today = meta.today;
  const month = meta.ranges.month;
  const base = { businessId: id(businessId), status: { $in: ISSUED_STATUSES } };
  const [totalSales, todaySales, monthSales, gstCollected, outstanding, totalInvoices, paidInvoices, pendingInvoices, recent, customerCount, productCount] =
    await Promise.all([
      sum(base, 'totals.grandTotal'),
      sum({ ...base, invoiceDateKey: today }, 'totals.grandTotal'),
      sum({ ...base, invoiceDateKey: { $gte: month.from, $lte: month.to } }, 'totals.grandTotal'),
      sum({ ...base, isGstInvoice: true }, 'totals.taxAmount'),
      sum({ businessId: id(businessId), status: { $in: ['unpaid', 'partial'] } }, 'amountDue'),
      Invoice.countDocuments(base),
      Invoice.countDocuments({ ...base, status: 'paid' }),
      Invoice.countDocuments({ businessId: id(businessId), status: { $in: ['unpaid', 'partial'] } }),
      Invoice.find({ businessId }).sort({ invoiceDateKey: -1, createdAt: -1 }).limit(8),
      Customer.countDocuments({ businessId, archived: { $ne: true } }),
      Product.countDocuments({ businessId, archived: { $ne: true } }),
    ]);

  const from = (await import('../domain/dates.js')).addDays(today, -29);
  const chartRows = await Invoice.aggregate([
    { $match: { ...base, invoiceDateKey: { $gte: from, $lte: today } } },
    { $group: { _id: '$invoiceDateKey', total: { $sum: '$totals.grandTotal' } } },
  ]);
  const series = eachDate(from, today).map((date) => ({
    date,
    total: roundMoney(chartRows.find((row) => row._id === date)?.total ?? 0),
  }));

  const lowStock = await Product.find({ businessId, archived: { $ne: true }, trackStock: true }).limit(20);
  const overdue = await Invoice.find({
    businessId,
    status: { $in: ['unpaid', 'partial'] },
    dueDateKey: { $ne: '', $lt: today },
  })
    .sort({ dueDateKey: 1 })
    .limit(6);

  const notifications = [
    ...overdue.map((invoice) => ({
      id: `due-${invoice._id}`,
      tone: 'warning' as const,
      title: `${invoice.number} is overdue`,
      detail: invoice.customerSnapshot?.name || 'Customer',
      href: `/invoices/${invoice._id}`,
    })),
    ...lowStock
      .filter((product) => (product.stockQuantity ?? 0) <= (product.lowStockThreshold ?? 5))
      .slice(0, 5)
      .map((product) => ({
        id: `stock-${product._id}`,
        tone: 'warning' as const,
        title: `${product.name} is low on stock`,
        detail: `${product.stockQuantity ?? 0} ${product.unit} left`,
        href: '/products',
      })),
  ];

  const purchaseMatch = { businessId: id(businessId), status: { $ne: 'cancelled' } };
  const [todayPurchases, monthPurchases, supplierDue, expenseRows, machineCount, activeMachines, dueMaintenance, stockUnits] = await Promise.all([
    Purchase.aggregate([{ $match: { ...purchaseMatch, purchaseDateKey: today } }, { $group: { _id: null, total: { $sum: '$totals.grandTotal' } } }]),
    Purchase.aggregate([{ $match: { ...purchaseMatch, purchaseDateKey: { $gte: month.from, $lte: month.to } } }, { $group: { _id: null, total: { $sum: '$totals.grandTotal' } } }]),
    Purchase.aggregate([{ $match: { businessId: id(businessId), status: { $in: ['unpaid', 'partial'] } } }, { $group: { _id: null, total: { $sum: '$amountDue' } } }]),
    Expense.find({ businessId, archived: { $ne: true }, dateKey: { $gte: month.from, $lte: month.to } }),
    Machine.countDocuments({ businessId, archived: { $ne: true } }),
    Machine.countDocuments({ businessId, archived: { $ne: true }, status: 'active' }),
    MachineMaintenance.find({ businessId, nextDateKey: { $gte: today, $ne: '' } }).sort({ nextDateKey: 1 }).limit(5),
    Product.aggregate([{ $match: { businessId: id(businessId), archived: { $ne: true }, trackStock: true } }, { $group: { _id: null, qty: { $sum: '$stockQuantity' } } }]),
  ]);
  const monthExpenses = roundMoney(expenseRows.reduce((sum, row) => sum + row.amount, 0));
  const catalog = await Product.find({ businessId, archived: { $ne: true } });
  const byProduct = new Map(catalog.map((product) => [String(product._id), product]));
  const tracked = catalog.filter((product) => product.trackStock);
  const lowStockCount = tracked.filter((product) => (product.stockQuantity ?? 0) > 0 && (product.stockQuantity ?? 0) <= (product.lowStockThreshold ?? 5)).length;
  const outOfStock = tracked.filter((product) => (product.stockQuantity ?? 0) <= 0).length;
  const costed = await Invoice.find(base);
  let estimatedProfit = 0;
  let profitKnown = false;
  for (const invoice of costed) {
    for (const item of invoice.items) {
      const product = item.productId ? byProduct.get(String(item.productId)) : undefined;
      const unit = item.unitCost != null ? item.unitCost : product?.purchasePrice;
      if (unit == null) continue;
      profitKnown = true;
      estimatedProfit += (item.taxableAmount || 0) - unit * item.quantity;
    }
  }
  const purchaseChart = await Purchase.aggregate([
    { $match: { ...purchaseMatch, purchaseDateKey: { $gte: from, $lte: today } } },
    { $group: { _id: '$purchaseDateKey', total: { $sum: '$totals.grandTotal' } } },
  ]);
  const topProducts = await Invoice.aggregate([
    { $match: base },
    { $unwind: '$items' },
    { $group: { _id: '$items.name', total: { $sum: '$items.total' }, quantity: { $sum: '$items.quantity' } } },
    { $sort: { total: -1 } },
    { $limit: 5 },
  ]);
  const expenseBreakdown = new Map<string, number>();
  for (const row of expenseRows) expenseBreakdown.set(row.category, (expenseBreakdown.get(row.category) || 0) + row.amount);
  const movement = await StockMovement.aggregate([
    { $match: { businessId: id(businessId), dateKey: { $gte: from, $lte: today } } },
    { $group: { _id: '$dateKey', in: { $sum: '$qtyIn' }, out: { $sum: '$qtyOut' } } },
  ]);

  return {
    stats: {
      totalSales,
      todaySales,
      monthSales,
      totalInvoices,
      paidInvoices,
      pendingInvoices,
      outstanding,
      gstCollected,
      todayPurchases: roundMoney(todayPurchases[0]?.total ?? 0),
      monthPurchases: roundMoney(monthPurchases[0]?.total ?? 0),
      supplierOutstanding: roundMoney(supplierDue[0]?.total ?? 0),
      productCount,
      stockUnits: roundMoney(stockUnits[0]?.qty ?? 0),
      lowStock: lowStockCount,
      outOfStock,
      receivables: outstanding,
      payables: roundMoney(supplierDue[0]?.total ?? 0),
      expenses: monthExpenses,
      estimatedProfit: profitKnown ? roundMoney(estimatedProfit - monthExpenses) : null,
      grossProfit: profitKnown ? roundMoney(estimatedProfit) : null,
      machines: machineCount,
      activeMachines,
      maintenanceDue: dueMaintenance.length,
    },
    salesVsPurchases: eachDate(from, today).map((date) => ({
      date,
      sales: roundMoney(chartRows.find((row) => row._id === date)?.total ?? 0),
      purchases: roundMoney(purchaseChart.find((row) => row._id === date)?.total ?? 0),
    })),
    topProducts: topProducts.map((row) => ({ name: row._id, total: roundMoney(row.total), quantity: roundMoney(row.quantity) })),
    expenseBreakdown: [...expenseBreakdown.entries()].map(([name, total]) => ({ name, total: roundMoney(total) })),
    stockMovement: eachDate(from, today).map((date) => ({
      date,
      in: roundMoney(movement.find((row) => row._id === date)?.in ?? 0),
      out: roundMoney(movement.find((row) => row._id === date)?.out ?? 0),
    })),
    upcomingMaintenance: await Promise.all(
      dueMaintenance.map(async (row) => {
        const machine = await Machine.findById(row.machineId);
        return { id: String(row._id), machine: machine?.name || 'Machine', date: row.nextDateKey, type: row.maintenanceType, cost: row.cost };
      }),
    ),
    chart: series,
    recent: recent.map((invoice) => ({
      id: String(invoice._id),
      number: invoice.number,
      invoiceDate: invoice.invoiceDateKey,
      customerName: invoice.customerSnapshot?.name || '—',
      status: invoice.status,
      statusLabel: statusLabel(invoice.status),
      grandTotal: invoice.totals.grandTotal,
      amountDue: invoice.amountDue,
    })),
    notifications,
    checklist:
      totalInvoices === 0
        ? { business: true, customer: customerCount > 0, product: productCount > 0, invoice: false }
        : null,
    timezone: meta.timezone,
  };
}

export async function salesReport(businessId: string, from?: string, to?: string) {
  const match = issuedMatch(businessId, from, to);
  const invoices = await Invoice.find({
    businessId,
    status: { $in: ISSUED_STATUSES },
    ...(from || to ? { invoiceDateKey: { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) } } : {}),
  }).sort({ invoiceDateKey: 1, number: 1 });
  const total = roundMoney(invoices.reduce((sum, invoice) => sum + invoice.totals.grandTotal, 0));
  const tax = roundMoney(invoices.reduce((sum, invoice) => sum + invoice.totals.taxAmount, 0));
  return {
    total,
    tax,
    count: invoices.length,
    rows: invoices.map((invoice) => ({
      number: invoice.number,
      date: invoice.invoiceDateKey,
      customer: invoice.customerSnapshot?.name || '',
      status: statusLabel(invoice.status),
      taxable: invoice.totals.taxableAmount,
      tax: invoice.totals.taxAmount,
      total: invoice.totals.grandTotal,
      paid: invoice.amountPaid,
      due: invoice.amountDue,
    })),
  };
}

export async function gstReport(businessId: string, from?: string, to?: string) {
  const match = issuedMatch(businessId, from, to);
  const rows = await Invoice.aggregate([
    { $match: { ...match, isGstInvoice: true } },
    { $unwind: '$items' },
    {
      $group: {
        _id: { hsn: '$items.hsnSac', rate: '$items.gstRate' },
        taxable: { $sum: '$items.taxableAmount' },
        cgst: { $sum: '$items.cgst' },
        sgst: { $sum: '$items.sgst' },
        igst: { $sum: '$items.igst' },
      },
    },
    { $sort: { '_id.rate': 1, '_id.hsn': 1 } },
  ]);
  const buckets = rows.map((row) => ({
    hsnSac: row._id.hsn || '',
    gstRate: row._id.rate,
    taxable: roundMoney(row.taxable),
    cgst: roundMoney(row.cgst),
    sgst: roundMoney(row.sgst),
    igst: roundMoney(row.igst),
  }));
  return {
    taxable: roundMoney(buckets.reduce((sum, row) => sum + row.taxable, 0)),
    cgst: roundMoney(buckets.reduce((sum, row) => sum + row.cgst, 0)),
    sgst: roundMoney(buckets.reduce((sum, row) => sum + row.sgst, 0)),
    igst: roundMoney(buckets.reduce((sum, row) => sum + row.igst, 0)),
    rows: buckets,
  };
}

export async function customerReport(businessId: string, from?: string, to?: string) {
  const match = issuedMatch(businessId, from, to);
  const rows = await Invoice.aggregate([
    { $match: match },
    {
      $group: {
        _id: { id: '$customerId', name: '$customerSnapshot.name' },
        invoices: { $sum: 1 },
        total: { $sum: '$totals.grandTotal' },
        due: { $sum: '$amountDue' },
      },
    },
    { $sort: { total: -1 } },
  ]);
  return rows.map((row) => ({
    customerId: row._id.id ? String(row._id.id) : '',
    customer: row._id.name || '—',
    invoices: row.invoices,
    total: roundMoney(row.total),
    due: roundMoney(row.due),
  }));
}

export async function productReport(businessId: string, from?: string, to?: string) {
  const match = issuedMatch(businessId, from, to);
  const rows = await Invoice.aggregate([
    { $match: match },
    { $unwind: '$items' },
    {
      $group: {
        _id: { name: '$items.name', hsn: '$items.hsnSac', unit: '$items.unit' },
        quantity: { $sum: '$items.quantity' },
        taxable: { $sum: '$items.taxableAmount' },
        total: { $sum: '$items.total' },
      },
    },
    { $sort: { total: -1 } },
  ]);
  return rows.map((row) => ({
    name: row._id.name,
    hsnSac: row._id.hsn || '',
    unit: row._id.unit || '',
    quantity: roundMoney(row.quantity),
    taxable: roundMoney(row.taxable),
    total: roundMoney(row.total),
  }));
}

export async function paymentReport(businessId: string, from?: string, to?: string) {
  if (from) parseDateKey(from);
  if (to) parseDateKey(to);
  const payments = await Payment.find({
    businessId,
    ...(from || to ? { paidAtKey: { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) } } : {}),
  }).sort({ paidAtKey: -1 });
  const invoices = await Invoice.find({ _id: { $in: payments.map((payment) => payment.invoiceId) } });
  const byId = new Map(invoices.map((invoice) => [String(invoice._id), invoice]));
  const rows = payments.map((payment) => {
    const invoice = byId.get(String(payment.invoiceId));
    return {
      date: payment.paidAtKey,
      invoice: invoice?.number || '',
      customer: invoice?.customerSnapshot?.name || '',
      method: methodLabel(payment.method),
      reference: payment.reference || '',
      amount: payment.amount,
    };
  });
  return { total: roundMoney(rows.reduce((sum, row) => sum + row.amount, 0)), rows };
}

export async function outstandingReport(businessId: string, from?: string, to?: string) {
  const invoices = await Invoice.find({
    businessId,
    status: { $in: ['unpaid', 'partial'] },
    ...(from || to ? { invoiceDateKey: { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) } } : {}),
  }).sort({ dueDateKey: 1, invoiceDateKey: 1 });
  const rows = invoices.map((invoice) => ({
    number: invoice.number,
    date: invoice.invoiceDateKey,
    dueDate: invoice.dueDateKey,
    customer: invoice.customerSnapshot?.name || '',
    status: statusLabel(invoice.status),
    total: invoice.totals.grandTotal,
    paid: invoice.amountPaid,
    due: invoice.amountDue,
  }));
  return { total: roundMoney(rows.reduce((sum, row) => sum + row.due, 0)), rows };
}

export async function purchaseReport(businessId: string, from?: string, to?: string) {
  const rows = await Purchase.find({
    businessId,
    status: { $ne: 'cancelled' },
    ...(from || to ? { purchaseDateKey: { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) } } : {}),
  }).sort({ purchaseDateKey: 1 });
  return {
    total: roundMoney(rows.reduce((sum, row) => sum + (row.totals?.grandTotal || 0), 0)),
    rows: rows.map((row) => ({
      number: row.number,
      date: row.purchaseDateKey,
      supplier: row.supplierSnapshot?.name || '',
      invoice: row.supplierInvoice || '',
      total: row.totals?.grandTotal || 0,
      paid: row.amountPaid,
      due: row.amountDue,
    })),
  };
}

export async function inventoryReport(businessId: string) {
  const settings = await BusinessSettings.findOne({ businessId });
  const method = settings?.inventory?.valuation || 'purchase';
  const products = await Product.find({ businessId, archived: { $ne: true }, trackStock: true }).sort({ name: 1 });
  const rows = products.map((product) => {
    const qty = product.stockQuantity ?? 0;
    const rate = method === 'retail' ? product.sellingPrice : product.purchasePrice;
    return {
      name: product.name,
      sku: product.sku || '',
      quantity: qty,
      unit: product.unit,
      rate,
      value: rate == null ? null : roundMoney(rate * qty),
      low: qty <= (product.lowStockThreshold ?? 5),
    };
  });
  return { method, rows, total: roundMoney(rows.reduce((sum, row) => sum + (row.value || 0), 0)) };
}

export async function profitReport(businessId: string, from?: string, to?: string) {
  const match = issuedMatch(businessId, from, to);
  const invoices = await Invoice.find(match);
  const products = await Product.find({ businessId });
  const byId = new Map(products.map((product) => [String(product._id), product]));
  let revenue = 0;
  let cost = 0;
  let unavailable = false;
  for (const invoice of invoices) {
    revenue += invoice.totals.taxableAmount || 0;
    for (const item of invoice.items) {
      const product = item.productId ? byId.get(String(item.productId)) : undefined;
      const unit = item.unitCost != null ? item.unitCost : product?.purchasePrice;
      if (unit == null) {
        unavailable = true;
        continue;
      }
      cost += unit * item.quantity;
    }
  }
  const expenses = await Expense.find({
    businessId,
    archived: { $ne: true },
    ...(from || to ? { dateKey: { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) } } : {}),
  });
  const expenseTotal = roundMoney(expenses.reduce((sum, row) => sum + row.amount, 0));
  const gross = unavailable && cost === 0 ? null : roundMoney(revenue - cost);
  return {
    revenue: roundMoney(revenue),
    cost: cost ? roundMoney(cost) : null,
    grossProfit: gross,
    expenses: expenseTotal,
    netProfit: gross == null ? null : roundMoney(gross - expenseTotal),
    costUnavailable: unavailable,
  };
}

export async function expenseReport(businessId: string, from?: string, to?: string) {
  const rows = await Expense.find({
    businessId,
    archived: { $ne: true },
    ...(from || to ? { dateKey: { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) } } : {}),
  }).sort({ dateKey: -1 });
  return {
    total: roundMoney(rows.reduce((sum, row) => sum + row.amount, 0)),
    rows: rows.map((row) => ({ date: row.dateKey, name: row.name, category: row.category, vendor: row.vendor, method: row.method, amount: row.amount })),
  };
}

export function toCsv(headers: string[], rows: (string | number)[][]): string {
  const body = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\r\n');
  return `\uFEFF${body}`;
}
