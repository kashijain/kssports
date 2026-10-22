import { Router } from 'express';
import { asyncHandler, HttpError } from '../http.js';
import { requireAuth, requireBusiness } from '../middleware/auth.js';
import { Customer, Invoice, Product } from '../models.js';
import { presentCustomer, presentInvoiceListItem, presentProduct } from '../present.js';
import { customerSchema, productSchema } from '../schemas.js';
import { saveCustomer, saveProduct } from '../services/catalog.js';
import { productActivity } from '../services/operations.js';
import { commitStock } from '../services/stock.js';
import { upload, removeUpload, storedPublicImage } from '../services/files.js';
import { todayKey } from '../domain/dates.js';
import { escapeRegex, pageQuery } from '../util.js';
import { parseBody } from '../validate.js';

export const customerRouter = Router();
export const productRouter = Router();

customerRouter.use(requireAuth, requireBusiness);
productRouter.use(requireAuth, requireBusiness);

customerRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = pageQuery(req.query);
    const q = String(req.query.q || '').trim();
    const filter: Record<string, unknown> = { businessId: req.auth!.businessId, archived: { $ne: true } };
    if (q) {
      const rx = new RegExp(escapeRegex(q), 'i');
      filter.$or = [{ name: rx }, { mobile: rx }, { gstin: rx }, { email: rx }];
    }
    const [customers, total] = await Promise.all([
      Customer.find(filter).sort({ name: 1 }).skip(skip).limit(limit),
      Customer.countDocuments(filter),
    ]);
    res.json({ customers: customers.map(presentCustomer), total, page, pages: Math.max(1, Math.ceil(total / limit)) });
  }),
);

customerRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const customer = await saveCustomer(req.auth!.businessId!, parseBody(customerSchema, req.body));
    res.status(201).json({ customer: presentCustomer(customer) });
  }),
);

customerRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const customer = await Customer.findOne({ _id: req.params.id, businessId: req.auth!.businessId });
    if (!customer) throw new HttpError(404, 'Customer not found.');
    res.json({ customer: presentCustomer(customer) });
  }),
);

customerRouter.get(
  '/:id/invoices',
  asyncHandler(async (req, res) => {
    const customer = await Customer.findOne({ _id: req.params.id, businessId: req.auth!.businessId });
    if (!customer) throw new HttpError(404, 'Customer not found.');
    const invoices = await Invoice.find({ businessId: req.auth!.businessId, customerId: customer._id }).sort({ invoiceDateKey: -1 });
    res.json({ customer: presentCustomer(customer), invoices: invoices.map(presentInvoiceListItem) });
  }),
);

customerRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const customer = await saveCustomer(req.auth!.businessId!, parseBody(customerSchema, req.body), req.params.id);
    res.json({ customer: presentCustomer(customer) });
  }),
);

customerRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const customer = await Customer.findOneAndUpdate(
      { _id: req.params.id, businessId: req.auth!.businessId },
      { archived: true },
      { new: true },
    );
    if (!customer) throw new HttpError(404, 'Customer not found.');
    res.json({ ok: true });
  }),
);

productRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = pageQuery({ ...req.query, limit: req.query.limit || 100 });
    const q = String(req.query.q || '').trim();
    const filter: Record<string, unknown> = { businessId: req.auth!.businessId, archived: { $ne: true } };
    if (q) {
      const rx = new RegExp(escapeRegex(q), 'i');
      filter.$or = [{ name: rx }, { sku: rx }, { hsnSac: rx }, { category: rx }];
    }
    const [products, total] = await Promise.all([
      Product.find(filter).sort({ name: 1 }).skip(skip).limit(limit),
      Product.countDocuments(filter),
    ]);
    res.json({ products: products.map(presentProduct), total, page, pages: Math.max(1, Math.ceil(total / limit)) });
  }),
);

productRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const product = await saveProduct(req.auth!.businessId!, parseBody(productSchema, req.body));
    res.status(201).json({ product: presentProduct(product) });
  }),
);

productRouter.get(
  '/:id/activity',
  asyncHandler(async (req, res) => {
    res.json(await productActivity(req.auth!.businessId!, req.params.id));
  }),
);

productRouter.post(
  '/:id/stock',
  asyncHandler(async (req, res) => {
    const quantity = Number(req.body?.quantity);
    if (!quantity || quantity <= 0) throw new HttpError(400, 'Enter a quantity to add.');
    const product = await Product.findOne({ _id: req.params.id, businessId: req.auth!.businessId });
    if (!product) throw new HttpError(404, 'Product not found.');
    if (!product.trackStock) {
      product.trackStock = true;
      product.stockQuantity = product.stockQuantity ?? 0;
      await product.save();
    }
    await commitStock(req.auth!.businessId!, [
      {
        productId: String(product._id),
        quantity,
        direction: 'in',
        type: 'adjustment',
        reference: 'Stock added',
        dateKey: String(req.body?.date || todayKey('Asia/Kolkata')),
        note: String(req.body?.note || ''),
      },
    ]);
    const fresh = await Product.findById(product._id);
    res.json({ product: presentProduct(fresh) });
  }),
);

productRouter.post(
  '/:id/images',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const product = await Product.findOne({ _id: req.params.id, businessId: req.auth!.businessId });
    if (!product) throw new HttpError(404, 'Product not found.');
    if (!req.file) throw new HttpError(400, 'Choose an image.');
    const relative = await storedPublicImage(req.file, req.auth!.businessId!, 'products');
    product.images.push({ path: relative, alt: product.name });
    await product.save();
    res.status(201).json({ product: presentProduct(product) });
  }),
);

productRouter.delete(
  '/:id/images/:imageId',
  asyncHandler(async (req, res) => {
    const product = await Product.findOne({ _id: req.params.id, businessId: req.auth!.businessId });
    if (!product) throw new HttpError(404, 'Product not found.');
    const image = product.images.id(req.params.imageId);
    if (!image) throw new HttpError(404, 'Image not found.');
    await removeUpload(image.path || '');
    image.deleteOne();
    await product.save();
    res.json({ product: presentProduct(product) });
  }),
);

productRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const product = await Product.findOne({ _id: req.params.id, businessId: req.auth!.businessId });
    if (!product) throw new HttpError(404, 'Product not found.');
    res.json({ product: presentProduct(product) });
  }),
);

productRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const product = await saveProduct(req.auth!.businessId!, parseBody(productSchema, req.body), req.params.id);
    res.json({ product: presentProduct(product) });
  }),
);

productRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, businessId: req.auth!.businessId },
      { archived: true },
      { new: true },
    );
    if (!product) throw new HttpError(404, 'Product not found.');
    res.json({ ok: true });
  }),
);
