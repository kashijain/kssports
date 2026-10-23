import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { config, uploadsDir } from '../src/config.js';
import { connect, disconnect } from '../src/db.js';
import { gstinCheckCharacter } from '../src/domain/gstin.js';
import { Product, StockMovement } from '../src/models.js';
import { cloudinaryEnabled, publicAssetUrl } from '../src/services/files.js';

const app = createApp();
const gstin = (state: string, pan: string) => `${state}${pan}1Z${gstinCheckCharacter(`${state}${pan}1Z`)}`;

async function shop() {
  const agent = request.agent(app);
  const registered = await agent.post('/api/auth/register').send({ name: 'KS Owner', email: `ops-${Date.now()}@shop.test`, password: 'Secret123' });
  expect(registered.status).toBe(201);
  const business = await agent.put('/api/business').send({
    name: 'KS Sports',
    ownerName: 'KS Owner',
    mobile: '9845012345',
    addressLine1: 'Stadium Road',
    city: 'Jaipur',
    stateCode: '08',
    pincode: '302001',
    gstin: gstin('08', 'AAPFA1234L'),
    pan: 'AAPFA1234L',
  });
  expect(business.status).toBe(200);
  return agent;
}

beforeAll(async () => {
  if (!config.mongoUri.includes('lekha_test')) throw new Error('Refusing to run tests outside lekha_test');
  await connect();
});

beforeEach(async () => {
  const collections = await mongoose.connection.db!.collections();
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
});

afterAll(async () => {
  await disconnect();
});

describe('KS Sports operations', () => {
  it('moves stock from purchase to sale and blocks a negative balance', async () => {
    const agent = await shop();
    const product = await agent.post('/api/products').send({
      name: 'KS English Willow Cricket Bat',
      sku: 'KS-BAT-001',
      hsnSac: '9506',
      unit: 'pcs',
      sellingPrice: 7000,
      purchasePrice: 5000,
      gstRate: 18,
      trackStock: true,
      stockQuantity: 0,
      specifications: [{ label: 'Grade', value: 'A' }],
    });
    expect(product.status).toBe(201);
    const id = product.body.product.id;

    const purchase = await agent.post('/api/purchases').send({
      supplier: { name: 'ABC Sports', company: 'ABC Sports Pvt Ltd', stateCode: '08', gstin: gstin('08', 'AABCA1111B') },
      supplierInvoice: 'ABC-2026-1054',
      purchaseDate: '2026-10-22',
      status: 'unpaid',
      paymentMethod: 'bank_transfer',
      items: [{ productId: id, name: 'KS English Willow Cricket Bat', sku: 'KS-BAT-001', quantity: 10, purchasePrice: 5000, gstRate: 18 }],
    });
    expect(purchase.status, JSON.stringify(purchase.body)).toBe(201);
    expect((await Product.findById(id))!.stockQuantity).toBe(10);

    const customer = await agent.post('/api/customers').send({ name: 'City Club', stateCode: '08' });
    const sale = await agent.post('/api/invoices').send({
      status: 'unpaid',
      invoiceDate: '2026-10-23',
      customerId: customer.body.customer.id,
      placeOfSupplyStateCode: '08',
      items: [{ productId: id, name: 'KS English Willow Cricket Bat', quantity: 2, rate: 7000, gstRate: 18, unit: 'pcs' }],
    });
    expect(sale.status, JSON.stringify(sale.body)).toBe(201);
    expect(sale.body.invoice.totals.cgst).toBe(1260);
    expect(sale.body.invoice.totals.sgst).toBe(1260);
    expect((await Product.findById(id))!.stockQuantity).toBe(8);

    const more = await agent.post('/api/purchases').send({
      supplierId: purchase.body.purchase.supplierId,
      supplierInvoice: 'ABC-2026-1100',
      purchaseDate: '2026-10-24',
      status: 'paid',
      items: [{ productId: id, name: 'KS English Willow Cricket Bat', quantity: 5, purchasePrice: 4800, gstRate: 18 }],
    });
    expect(more.status, JSON.stringify(more.body)).toBe(201);
    expect((await Product.findById(id))!.stockQuantity).toBe(13);

    const history = await StockMovement.find({ productId: id }).sort({ createdAt: 1 });
    expect(history.map((row) => row.type)).toEqual(['purchase', 'sale', 'purchase']);
    expect(history.map((row) => row.balance)).toEqual([10, 8, 13]);

    const tooMany = await agent.post('/api/invoices').send({
      status: 'unpaid',
      invoiceDate: '2026-10-25',
      customerId: customer.body.customer.id,
      placeOfSupplyStateCode: '08',
      items: [{ productId: id, name: 'KS English Willow Cricket Bat', quantity: 20, rate: 7000, gstRate: 18 }],
    });
    expect(tooMany.status).toBe(400);
    expect((await Product.findById(id))!.stockQuantity).toBe(13);

    const sales = await agent.get('/api/sales');
    expect(sales.body.sales[0].grossProfit).toBe(4000);
    expect(sales.body.sales[0].costUnavailable).toBe(false);
  });

  it('builds a catalog PDF and stores a supplier bill on the purchase', async () => {
    const agent = await shop();
    const product = await agent.post('/api/products').send({
      name: 'Batting Gloves',
      sku: 'KS-GLV-001',
      sellingPrice: 1800,
      wholesalePrice: 1400,
      gstRate: 12,
      unit: 'pair',
      description: 'Club gloves',
    });
    const html = await agent.post('/api/catalog/preview').send({ ids: product.body.product.id });
    expect(html.status).toBe(200);
    expect(html.text).toContain('KS SPORTS');
    expect(html.text).toContain('Batting Gloves');
    expect(html.text).toContain('Wholesale price');

    const retail = await agent.post('/api/catalog/preview').send({ ids: product.body.product.id, priceMode: 'retail' });
    expect(retail.text).toContain('Retail price: ₹1,800.00');
    expect(retail.text).not.toContain('Wholesale price');
    const wholesale = await agent.post('/api/catalog/preview').send({ ids: product.body.product.id, priceMode: 'wholesale' });
    expect(wholesale.text).toContain('Wholesale price: ₹1,400.00');
    expect(wholesale.text).not.toContain('Retail price');

    const register = await agent.get('/api/purchases/download?format=csv');
    expect(register.status).toBe(200);
    expect(register.headers['content-type']).toContain('csv');
    expect(register.text).toContain('Purchase');
    const savedChrome = config.chromePath;
    config.chromePath = '';
    const registerPdf = await agent.get('/api/purchases/download').buffer(true);
    config.chromePath = savedChrome;
    expect(registerPdf.status).toBe(200);
    expect(registerPdf.headers['content-type']).toContain('pdf');
    expect(registerPdf.body.subarray(0, 4).toString()).toBe('%PDF');

    const pdf = await agent.get(`/api/catalog/pdf?ids=${product.body.product.id}`).buffer(true);
    expect(pdf.status).toBe(200);
    expect(pdf.body.subarray(0, 4).toString()).toBe('%PDF');

    const previousChrome = config.chromePath;
    config.chromePath = '';
    try {
      const plain = await agent.get(`/api/catalog/pdf?priceMode=retail&ids=${product.body.product.id}`).buffer(true);
      expect(plain.status).toBe(200);
      expect(plain.headers['content-type']).toContain('pdf');
      expect(plain.body.subarray(0, 4).toString()).toBe('%PDF');
      expect(plain.body.length).toBeGreaterThan(800);
    } finally {
      config.chromePath = previousChrome;
    }

    const purchase = await agent.post('/api/purchases').send({
      supplier: { name: 'ABC Sports Pvt Ltd', stateCode: '08' },
      supplierInvoice: 'ABC-2026-1054',
      purchaseDate: '2026-10-22',
      status: 'unpaid',
      items: [{ name: 'Batting Gloves', quantity: 4, purchasePrice: 900, gstRate: 12 }],
    });
    expect(purchase.status).toBe(201);
    const filled = await agent.get('/api/purchases/download?format=csv');
    expect(filled.text).toContain(purchase.body.purchase.number);
    expect(filled.text).toContain('ABC Sports Pvt Ltd');
    const oneBill = await agent.get(`/api/purchases/${purchase.body.purchase.id}/pdf`).buffer(true);
    expect(oneBill.status).toBe(200);
    expect(oneBill.body.subarray(0, 4).toString()).toBe('%PDF');
    const everyBill = await agent.get('/api/purchases/download?format=bills').buffer(true);
    expect(everyBill.status).toBe(200);
    expect(everyBill.headers['content-disposition']).toContain('ks-sports-purchase-bills.pdf');
    expect(everyBill.body.subarray(0, 4).toString()).toBe('%PDF');
    const bill = await agent
      .post(`/api/purchases/${purchase.body.purchase.id}/bill`)
      .attach('file', Buffer.from('%PDF-1.4\n%%EOF'), { filename: 'ABC_Sports_Invoice_1054.pdf', contentType: 'application/pdf' });
    expect(bill.status).toBe(201);
    expect(bill.body.document.name).toBe('ABC_Sports_Invoice_1054.pdf');

    const listed = await agent.get('/api/documents').query({ invoice: 'ABC-2026-1054', fileType: 'pdf' });
    expect(listed.body.documents).toHaveLength(1);
    const file = await agent.get(`/api/documents/${bill.body.document.id}/file`);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toContain('pdf');
  });

  it('keeps machine maintenance cost and the next service date', async () => {
    const agent = await shop();
    const machine = await agent.post('/api/machines').send({ name: 'Bat pressing machine', machineType: 'Press', status: 'active', location: 'Workshop' });
    expect(machine.status).toBe(201);
    const first = await agent.post(`/api/machines/${machine.body.machine.id}/maintenance`).send({
      dateKey: '2026-10-01',
      maintenanceType: 'Service',
      vendor: 'City Tools',
      cost: 1500,
      nextDateKey: '2026-12-01',
    });
    expect(first.status).toBe(201);
    await agent.post(`/api/machines/${machine.body.machine.id}/maintenance`).send({
      dateKey: '2026-10-20',
      maintenanceType: 'Repair',
      cost: 800,
      nextDateKey: '2026-11-15',
    });
    const detail = await agent.get(`/api/machines/${machine.body.machine.id}`);
    expect(detail.body.maintenanceCost).toBe(2300);
    expect(detail.body.maintenance).toHaveLength(2);
    const dash = await agent.get('/api/reports/dashboard');
    expect(dash.body.stats.machines).toBe(1);
    expect(dash.body.stats.maintenanceDue).toBe(2);
  });

  it('keeps uploads on disk when Cloudinary is not configured', async () => {
    expect(cloudinaryEnabled()).toBe(false);
    expect(publicAssetUrl('shop/photo.jpg')).toBe('/uploads/shop/photo.jpg');
    expect(publicAssetUrl('cldraw:kssports/shop/documents/bill')).toBe('');
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const agent = await shop();
    const product = await agent.post('/api/products').send({ name: 'Photo Bat', sellingPrice: 1000, gstRate: 0, unit: 'pcs' });
    expect(product.status).toBe(201);
    const productId = product.body.product.id;
    const image = await agent.post(`/api/products/${productId}/images`).attach('file', png, { filename: 'bat.png', contentType: 'image/png' });
    expect(image.status, JSON.stringify(image.body)).toBe(201);
    expect(image.body.product.images[0].url).toMatch(/^\/uploads\//);
    const saved = await Product.findById(productId);
    const relative = saved!.images[0].path || '';
    expect(relative.startsWith('cld')).toBe(false);
    expect(fs.existsSync(path.join(uploadsDir, relative))).toBe(true);
    const preview = await agent.post('/api/catalog/preview').send({ ids: productId });
    expect(preview.status).toBe(200);
    expect(preview.text).toContain('data:image/png;base64,');
    const pdf = await agent.get(`/api/catalog/pdf?ids=${productId}`).buffer(true);
    expect(pdf.status).toBe(200);
    expect(pdf.body.subarray(0, 4).toString()).toBe('%PDF');
    const removed = await agent.delete(`/api/products/${productId}/images/${image.body.product.images[0].id}`);
    expect(removed.status).toBe(200);
    expect(removed.body.product.images).toHaveLength(0);
    expect(fs.existsSync(path.join(uploadsDir, relative))).toBe(false);

    const logo = await agent.post('/api/business/logo').attach('file', png, { filename: 'logo.png', contentType: 'image/png' });
    expect(logo.status, JSON.stringify(logo.body)).toBe(200);
    expect(logo.body.business.logoUrl).toMatch(/^\/uploads\//);
    const signature = await agent.post('/api/business/signature').attach('file', png, { filename: 'sign.png', contentType: 'image/png' });
    expect(signature.status).toBe(200);
    expect(signature.body.business.signatureUrl).toMatch(/^\/uploads\//);
    const cleared = await agent.delete('/api/business/logo');
    expect(cleared.status).toBe(200);
    expect(cleared.body.business.logoUrl).toBe('/logo.png');

    const machine = await agent.post('/api/machines').send({ name: 'Photo press', machineType: 'Press', status: 'active' });
    const photo = await agent.post(`/api/machines/${machine.body.machine.id}/photo`).attach('file', png, { filename: 'press.png', contentType: 'image/png' });
    expect(photo.status, JSON.stringify(photo.body)).toBe(200);
    expect(photo.body.machine.photoUrl).toMatch(/^\/uploads\//);

    const purchase = await agent.post('/api/purchases').send({
      supplier: { name: 'ABC Sports Pvt Ltd', stateCode: '08' },
      supplierInvoice: 'ABC-2026-2001',
      purchaseDate: '2026-10-22',
      status: 'unpaid',
      items: [{ name: 'Photo Bat', quantity: 1, purchasePrice: 500, gstRate: 0 }],
    });
    const bill = await agent
      .post(`/api/purchases/${purchase.body.purchase.id}/bill`)
      .attach('file', Buffer.from('%PDF-1.4\n%%EOF'), { filename: 'supplier-bill.pdf', contentType: 'application/pdf' });
    expect(bill.status, JSON.stringify(bill.body)).toBe(201);
    const downloaded = await agent.get(`/api/documents/${bill.body.document.id}/file`).buffer(true);
    expect(downloaded.status).toBe(200);
    expect(downloaded.headers['content-type']).toContain('pdf');
    expect(downloaded.body.toString()).toContain('%PDF-1.4');
    expect(JSON.stringify(downloaded.headers)).not.toContain('cloudinary');
    const deleted = await agent.delete(`/api/documents/${bill.body.document.id}`);
    expect(deleted.status).toBe(200);
    const missing = await agent.get(`/api/documents/${bill.body.document.id}/file`);
    expect(missing.status).toBe(404);
  });
});
