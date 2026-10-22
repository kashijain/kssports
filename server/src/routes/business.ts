import { Router, type Request } from 'express';
import { PAYMENT_METHODS, TEMPLATES, UNITS, INVOICE_STATUSES } from '../domain/constants.js';
import { STATES } from '../domain/states.js';
import { asyncHandler, HttpError } from '../http.js';
import { requireAuth, requireBusiness, requireOwner } from '../middleware/auth.js';
import { Business, BusinessSettings, Product, TaxRate } from '../models.js';
import { presentBusiness, presentSettings, presentTaxRate } from '../present.js';
import { businessSchema, settingsSchema, taxRatePatchSchema, taxRateSchema } from '../schemas.js';
import { saveBusiness, saveSettings } from '../services/catalog.js';
import { removeUpload, storedPublicImage, upload } from '../services/files.js';
import { peekNextNumber } from '../services/numbering.js';
import { todayKey } from '../domain/dates.js';
import { roundRate } from '../domain/money.js';
import { parseBody } from '../validate.js';
export const metaRouter = Router();
export const businessRouter = Router();

metaRouter.get('/', (_req, res) => {
  res.json({ states: STATES, paymentMethods: PAYMENT_METHODS, units: UNITS, templates: TEMPLATES, statuses: INVOICE_STATUSES });
});

businessRouter.use(requireAuth, requireOwner);

businessRouter.put(
  '/',
  asyncHandler(async (req, res) => {
    const body = parseBody(businessSchema, req.body);
    const { business, settings } = await saveBusiness(req.auth!.id, body);
    res.json({ business: presentBusiness(business), settings: settings ? presentSettings(settings) : null });
  }),
);

async function replaceImage(req: Request, kind: 'logo' | 'signature') {
  const business = await Business.findOne({ _id: req.auth!.businessId, ownerId: req.auth!.id });
  if (!business) throw new HttpError(404, 'Business profile not found.');
  const file = req.file;
  if (!file) throw new HttpError(400, 'Choose an image to upload.');
  const relative = await storedPublicImage(file, req.auth!.businessId!, 'brand');
  const previous = kind === 'logo' ? business.logoPath : business.signaturePath;
  if (kind === 'logo') business.logoPath = relative;
  else business.signaturePath = relative;
  await business.save();
  if (previous && previous !== relative) await removeUpload(previous);
  return business;
}

businessRouter.post(
  '/logo',
  requireBusiness,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const business = await replaceImage(req, 'logo');
    res.json({ business: presentBusiness(business) });
  }),
);

businessRouter.delete(
  '/logo',
  requireBusiness,
  asyncHandler(async (req, res) => {
    const business = await Business.findById(req.auth!.businessId);
    if (!business) throw new HttpError(404, 'Business profile not found.');
    await removeUpload(business.logoPath || '');
    business.logoPath = '';
    await business.save();
    res.json({ business: presentBusiness(business) });
  }),
);

businessRouter.post(
  '/signature',
  requireBusiness,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const business = await replaceImage(req, 'signature');
    res.json({ business: presentBusiness(business) });
  }),
);

businessRouter.delete(
  '/signature',
  requireBusiness,
  asyncHandler(async (req, res) => {
    const business = await Business.findById(req.auth!.businessId);
    if (!business) throw new HttpError(404, 'Business profile not found.');
    await removeUpload(business.signaturePath || '');
    business.signaturePath = '';
    await business.save();
    res.json({ business: presentBusiness(business) });
  }),
);

export const settingsRouter = Router();
settingsRouter.use(requireAuth, requireBusiness);

settingsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const [settings, business] = await Promise.all([
      BusinessSettings.findOne({ businessId: req.auth!.businessId }),
      Business.findById(req.auth!.businessId),
    ]);
    if (!settings || !business) throw new HttpError(404, 'Settings not found.');
    const date = todayKey(settings.defaults.timezone);
    res.json({
      settings: presentSettings(settings),
      business: presentBusiness(business),
      nextNumber: peekNextNumber(settings, date),
    });
  }),
);

settingsRouter.put(
  '/',
  requireOwner,
  asyncHandler(async (req, res) => {
    const body = parseBody(settingsSchema, req.body);
    const settings = await saveSettings(req.auth!.businessId!, body);
    res.json({
      settings: presentSettings(settings),
      nextNumber: peekNextNumber(settings, todayKey(settings.defaults.timezone)),
    });
  }),
);

export const taxRouter = Router();
taxRouter.use(requireAuth, requireBusiness);

taxRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const rates = await TaxRate.find({ businessId: req.auth!.businessId }).sort({ rate: 1 });
    res.json({ taxRates: rates.map(presentTaxRate) });
  }),
);

taxRouter.post(
  '/',
  requireOwner,
  asyncHandler(async (req, res) => {
    const body = parseBody(taxRateSchema, req.body);
    const rate = roundRate(body.rate);
    const existing = await TaxRate.findOne({ businessId: req.auth!.businessId, rate });
    if (existing) {
      existing.active = true;
      if (body.name) existing.name = body.name;
      await existing.save();
      res.json({ taxRate: presentTaxRate(existing) });
      return;
    }
    const created = await TaxRate.create({
      businessId: req.auth!.businessId,
      rate,
      name: body.name?.trim() || (rate === 0 ? 'Nil / exempt (0%)' : `GST ${rate}%`),
      active: true,
    });
    res.status(201).json({ taxRate: presentTaxRate(created) });
  }),
);

taxRouter.patch(
  '/:id',
  requireOwner,
  asyncHandler(async (req, res) => {
    const body = parseBody(taxRatePatchSchema, req.body);
    const taxRate = await TaxRate.findOne({ _id: req.params.id, businessId: req.auth!.businessId });
    if (!taxRate) throw new HttpError(404, 'Tax rate not found.');
    if (body.active === false) {
      const activeCount = await TaxRate.countDocuments({ businessId: req.auth!.businessId, active: true, _id: { $ne: taxRate._id } });
      if (activeCount === 0) throw new HttpError(400, 'Keep at least one GST rate active.');
    }
    if (body.rate !== undefined) {
      const rate = roundRate(body.rate);
      const clash = await TaxRate.findOne({ businessId: req.auth!.businessId, rate, _id: { $ne: taxRate._id } });
      if (clash) throw new HttpError(409, 'That GST rate is already in the list.');
      taxRate.rate = rate;
    }
    if (body.name !== undefined) taxRate.name = body.name;
    if (body.active !== undefined) taxRate.active = body.active;
    await taxRate.save();
    const used = await Product.countDocuments({ businessId: req.auth!.businessId, gstRate: taxRate.rate, archived: { $ne: true } });
    res.json({
      taxRate: presentTaxRate(taxRate),
      warning:
        body.active === false && used
          ? `${used} product${used === 1 ? '' : 's'} still use ${taxRate.rate}%. Turn the rate back on, or edit those products, before billing them.`
          : '',
    });
  }),
);
