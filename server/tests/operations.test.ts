import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { config } from '../src/config.js';
import { connect, disconnect } from '../src/db.js';
import { gstinCheckCharacter } from '../src/domain/gstin.js';
import { Product, StockMovement } from '../src/models.js';

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

    const pdf = await agent.get(`/api/catalog/pdf?ids=${product.body.product.id}`).buffer(true);
    expect(pdf.status).toBe(200);
    expect(pdf.body.subarray(0, 4).toString()).toBe('%PDF');

    const purchase = await agent.post('/api/purchases').send({
      supplier: { name: 'ABC Sports Pvt Ltd', stateCode: '08' },
      supplierInvoice: 'ABC-2026-1054',
      purchaseDate: '2026-10-22',
      status: 'unpaid',
      items: [{ name: 'Batting Gloves', quantity: 4, purchasePrice: 900, gstRate: 12 }],
    });
    expect(purchase.status).toBe(201);
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
});
