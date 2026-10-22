import { Router } from 'express';
import { amountInWords } from '../domain/words.js';
import { calculateInvoice } from '../domain/gst.js';
import { DomainError } from '../domain/errors.js';
import { asyncHandler, HttpError } from '../http.js';
import { requireAuth, requireBusiness } from '../middleware/auth.js';
import { Business, BusinessSettings, Invoice, Payment } from '../models.js';
import { presentInvoiceListItem, presentPayment } from '../present.js';
import { calculateSchema, cancelSchema, invoiceSchema, recordPaymentSchema } from '../schemas.js';
import { withPdf } from '../services/pdf.js';
import { invoiceToPdf } from '../services/shopPdf.js';
import { toInvoiceView } from '../services/invoiceView.js';
import {
  cancelInvoice,
  createInvoice,
  deleteDraft,
  getInvoiceDetail,
  previewInvoiceHtml,
  recordPayment,
  renderStoredInvoice,
  rotateShareToken,
  updateInvoice,
} from '../services/invoices.js';
import { peekNextNumber } from '../services/numbering.js';
import { todayKey } from '../domain/dates.js';
import { escapeRegex, pageQuery } from '../util.js';
import { parseBody } from '../validate.js';

export const invoiceRouter = Router();
export const paymentRouter = Router();
export const publicRouter = Router();

invoiceRouter.use(requireAuth, requireBusiness);
paymentRouter.use(requireAuth, requireBusiness);

invoiceRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = pageQuery(req.query);
    const q = String(req.query.q || '').trim();
    const filter: Record<string, unknown> = { businessId: req.auth!.businessId };
    if (req.query.status) filter.status = String(req.query.status);
    if (req.query.customerId) filter.customerId = String(req.query.customerId);
    const from = String(req.query.from || '');
    const to = String(req.query.to || '');
    if (from || to) filter.invoiceDateKey = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
    if (q) {
      const rx = new RegExp(escapeRegex(q.slice(0, 80)), 'i');
      filter.$or = [{ number: rx }, { 'customerSnapshot.name': rx }, { 'customerSnapshot.mobile': rx }];
    }
    const [invoices, total] = await Promise.all([
      Invoice.find(filter).sort({ invoiceDateKey: -1, createdAt: -1 }).skip(skip).limit(limit),
      Invoice.countDocuments(filter),
    ]);
    res.json({ invoices: invoices.map(presentInvoiceListItem), total, page, pages: Math.max(1, Math.ceil(total / limit)) });
  }),
);

invoiceRouter.get(
  '/next-number',
  asyncHandler(async (req, res) => {
    const settings = await BusinessSettings.findOne({ businessId: req.auth!.businessId });
    if (!settings) throw new HttpError(404, 'Settings not found.');
    const date = String(req.query.date || todayKey(settings.defaults.timezone));
    res.json({ number: peekNextNumber(settings, date), date });
  }),
);

invoiceRouter.post(
  '/calculate',
  asyncHandler(async (req, res) => {
    const body = parseBody(calculateSchema, req.body);
    const [business, settings] = await Promise.all([
      Business.findById(req.auth!.businessId),
      BusinessSettings.findOne({ businessId: req.auth!.businessId }),
    ]);
    if (!business || !settings) throw new HttpError(409, 'Add your business profile to continue.');
    try {
      const totals = calculateInvoice({
        lines: body.lines as never,
        invoiceDiscountMode: body.invoiceDiscountMode,
        invoiceDiscountValue: body.invoiceDiscountValue,
        gstApplicable: body.gstApplicable ?? Boolean(business.gstin),
        sellerStateCode: business.stateCode,
        placeOfSupplyStateCode: body.placeOfSupplyStateCode || business.stateCode,
        priceMode: body.priceMode ?? (settings.defaults.priceMode as 'exclusive' | 'inclusive'),
        roundOff: body.roundOff ?? (settings.defaults.roundOff as 'nearest_rupee' | 'none'),
      });
      res.json({ ...totals, amountInWords: amountInWords(totals.grandTotal) });
    } catch (error) {
      if (error instanceof DomainError) throw new HttpError(400, error.message);
      throw error;
    }
  }),
);

invoiceRouter.post(
  '/preview',
  asyncHandler(async (req, res) => {
    const body = parseBody(invoiceSchema, {
      invoiceDate: todayKey('Asia/Kolkata'),
      ...req.body,
      status: req.body?.status || 'unpaid',
    });
    const html = await previewInvoiceHtml(req.auth!.businessId!, body, req.body?.invoiceId);
    res.type('html').send(html);
  }),
);

invoiceRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const result = await createInvoice(req.auth!.businessId!, parseBody(invoiceSchema, req.body));
    res.status(201).json(result);
  }),
);

invoiceRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json({ invoice: await getInvoiceDetail(req.auth!.businessId!, req.params.id) });
  }),
);

invoiceRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const result = await updateInvoice(req.auth!.businessId!, req.params.id, parseBody(invoiceSchema, req.body));
    res.json(result);
  }),
);

invoiceRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await deleteDraft(req.auth!.businessId!, req.params.id);
    res.json({ ok: true });
  }),
);

invoiceRouter.post(
  '/:id/cancel',
  asyncHandler(async (req, res) => {
    const body = parseBody(cancelSchema, req.body ?? {});
    res.json(await cancelInvoice(req.auth!.businessId!, req.params.id, body.reason));
  }),
);

invoiceRouter.post(
  '/:id/share',
  asyncHandler(async (req, res) => {
    res.json(await rotateShareToken(req.auth!.businessId!, req.params.id));
  }),
);

invoiceRouter.get(
  '/:id/html',
  asyncHandler(async (req, res) => {
    const invoice = await Invoice.findOne({ _id: req.params.id, businessId: req.auth!.businessId });
    if (!invoice) throw new HttpError(404, 'Invoice not found.');
    res.type('html').send(await renderStoredInvoice(invoice, req.query.print === '1'));
  }),
);

invoiceRouter.get(
  '/:id/pdf',
  asyncHandler(async (req, res) => {
    const invoice = await Invoice.findOne({ _id: req.params.id, businessId: req.auth!.businessId });
    if (!invoice) throw new HttpError(404, 'Invoice not found.');
    const pdf = await withPdf(
      () => renderStoredInvoice(invoice),
      () => invoiceToPdf(toInvoiceView(invoice)),
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${invoice.number}.pdf"`);
    res.send(pdf);
  }),
);

paymentRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = pageQuery(req.query);
    const filter: Record<string, unknown> = { businessId: req.auth!.businessId };
    if (req.query.invoiceId) filter.invoiceId = String(req.query.invoiceId);
    const from = String(req.query.from || '');
    const to = String(req.query.to || '');
    if (from || to) filter.paidAtKey = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
    const [payments, total] = await Promise.all([
      Payment.find(filter).sort({ paidAtKey: -1, createdAt: -1 }).skip(skip).limit(limit),
      Payment.countDocuments(filter),
    ]);
    const invoices = await Invoice.find({ _id: { $in: payments.map((payment) => payment.invoiceId) } });
    const byId = new Map(invoices.map((invoice) => [String(invoice._id), invoice]));
    res.json({
      payments: payments.map((payment) => ({
        ...presentPayment(payment),
        invoiceNumber: byId.get(String(payment.invoiceId))?.number || '',
        customerName: byId.get(String(payment.invoiceId))?.customerSnapshot?.name || '',
      })),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
    });
  }),
);

paymentRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = parseBody(recordPaymentSchema, req.body);
    const invoice = await recordPayment(req.auth!.businessId!, body as never);
    res.status(201).json({ invoice });
  }),
);

paymentRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const payment = await Payment.findOne({ _id: req.params.id, businessId: req.auth!.businessId });
    if (!payment) throw new HttpError(404, 'Payment not found.');
    const invoice = await Invoice.findOne({ _id: payment.invoiceId, businessId: req.auth!.businessId });
    await payment.deleteOne();
    if (invoice && invoice.status !== 'cancelled' && invoice.status !== 'draft') {
      const { fromPaise, toPaise } = await import('../domain/money.js');
      const payments = await Payment.find({ invoiceId: invoice._id });
      const paid = payments.reduce((sum, row) => sum + toPaise(row.amount), 0);
      const total = toPaise(invoice.totals.grandTotal);
      invoice.amountPaid = fromPaise(paid);
      invoice.amountDue = fromPaise(Math.max(0, total - paid));
      invoice.status = paid <= 0 ? (total === 0 ? 'paid' : 'unpaid') : paid < total ? 'partial' : 'paid';
      await invoice.save();
    }
    res.json({ ok: true });
  }),
);

publicRouter.get(
  '/invoices/:token',
  asyncHandler(async (req, res) => {
    const invoice = await Invoice.findOne({ shareToken: req.params.token });
    if (!invoice || invoice.status === 'draft') throw new HttpError(404, 'This invoice link is not available.');
    const { presentInvoiceDetail } = await import('../present.js');
    const payments = await Payment.find({ invoiceId: invoice._id }).sort({ paidAtKey: 1 });
    const detail = presentInvoiceDetail(invoice, payments);
    res.json({ invoice: { ...detail, shareToken: undefined } });
  }),
);

publicRouter.get(
  '/invoices/:token/html',
  asyncHandler(async (req, res) => {
    const invoice = await Invoice.findOne({ shareToken: req.params.token });
    if (!invoice || invoice.status === 'draft') throw new HttpError(404, 'This invoice link is not available.');
    res.type('html').send(await renderStoredInvoice(invoice, req.query.print === '1'));
  }),
);

publicRouter.get(
  '/invoices/:token/pdf',
  asyncHandler(async (req, res) => {
    const invoice = await Invoice.findOne({ shareToken: req.params.token });
    if (!invoice || invoice.status === 'draft') throw new HttpError(404, 'This invoice link is not available.');
    const pdf = await withPdf(
      () => renderStoredInvoice(invoice),
      () => invoiceToPdf(toInvoiceView(invoice)),
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${invoice.number}.pdf"`);
    res.send(pdf);
  }),
);
