import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { config } from '../src/config.js';
import { connect, disconnect } from '../src/db.js';
import { gstinCheckCharacter } from '../src/domain/gstin.js';
import { Business, Customer, Invoice, Product, User } from '../src/models.js';
import mongoose from 'mongoose';

const app = createApp();
const gstin = (state: string, pan: string) => {
  const body = `${state}${pan}1Z`;
  return body + gstinCheckCharacter(body);
};

async function owner(email: string) {
  const agent = request.agent(app);
  const registered = await agent.post('/api/auth/register').send({ name: 'Asha Rao', email, password: 'Secret123' });
  expect(registered.status).toBe(201);
  return agent;
}

async function setupShop(agent: request.SuperAgentTest, overrides: Record<string, unknown> = {}) {
  const response = await agent.put('/api/business').send({
    name: 'Asha Stores',
    ownerName: 'Asha Rao',
    mobile: '9845012345',
    email: 'asha@shop.test',
    addressLine1: '12 Market Road',
    addressLine2: '',
    city: 'Jaipur',
    stateCode: '08',
    pincode: '302001',
    gstin: gstin('08', 'AAPFA1234L'),
    pan: 'AAPFA1234L',
    upiId: 'asha@okaxis',
    bank: null,
    ...overrides,
  });
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return response.body;
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

describe('billing API', () => {
  it('registers, isolates tenants, and resets a password', async () => {
    const asha = await owner('asha@shop.test');
    await setupShop(asha);
    const me = await asha.get('/api/auth/me');
    expect(me.body.business.gstEnabled).toBe(true);
    expect(me.body.business.name).toBe('Asha Stores');

    const customer = await asha.post('/api/customers').send({ name: 'Local Buyer', stateCode: '08', mobile: '9811111111' });
    expect(customer.status).toBe(201);

    const other = await owner('other@shop.test');
    await setupShop(other, { name: 'Other Shop', gstin: '', pan: '', upiId: '' });
    const hidden = await other.get('/api/customers');
    expect(hidden.body.customers).toHaveLength(0);
    const peek = await other.get(`/api/customers/${customer.body.customer.id}`);
    expect(peek.status).toBe(404);

    const user = await User.findOne({ email: 'asha@shop.test' });
    user!.role = 'staff';
    await user!.save();
    const denied = await asha.post('/api/tax-rates').send({ rate: 3, name: 'Special' });
    expect(denied.status).toBe(403);

    const forgot = await request(app).post('/api/auth/forgot-password').send({ email: 'asha@shop.test' });
    expect(forgot.body.resetUrl).toMatch(/^\/reset\//);
    const token = forgot.body.resetUrl.split('/').pop();
    const reset = await request(app).post('/api/auth/reset-password').send({ token, password: 'Changed123' });
    expect(reset.status).toBe(200);
    const oldLogin = await request(app).post('/api/auth/login').send({ email: 'asha@shop.test', password: 'Secret123' });
    expect(oldLogin.status).toBe(401);
    const newLogin = await request(app).post('/api/auth/login').send({ email: 'asha@shop.test', password: 'Changed123' });
    expect(newLogin.status).toBe(200);
    expect(newLogin.body.token).toEqual(expect.any(String));
    const withoutCookie = await request(app).get('/api/customers').set('Authorization', `Bearer ${newLogin.body.token}`);
    expect(withoutCookie.status).toBe(200);
  });

  it('calculates intra-state and inter-state invoices and keeps history frozen', async () => {
    const agent = await owner('bill@shop.test');
    await setupShop(agent);
    const buyer = await agent.post('/api/customers').send({
      name: 'Mumbai Buyer',
      stateCode: '27',
      gstin: gstin('27', 'AABCM1234D'),
      billingAddress: { line1: 'Colaba', city: 'Mumbai', pincode: '400005' },
    });
    const local = await agent.post('/api/customers').send({ name: 'Jaipur Buyer', stateCode: '08' });
    const product = await agent.post('/api/products').send({
      name: 'Cotton kurta',
      sku: 'KT-1',
      hsnSac: '6204',
      unit: 'pcs',
      sellingPrice: 1000,
      gstRate: 18,
      trackStock: true,
      stockQuantity: 10,
    });
    expect(product.status).toBe(201);

    const intra = await agent.post('/api/invoices').send({
      status: 'unpaid',
      invoiceDate: '2026-10-22',
      customerId: local.body.customer.id,
      placeOfSupplyStateCode: '08',
      items: [{ productId: product.body.product.id, name: 'Cotton kurta', hsnSac: '6204', quantity: 1, rate: 1000, gstRate: 18, unit: 'pcs' }],
    });
    expect(intra.status, JSON.stringify(intra.body)).toBe(201);
    expect(intra.body.invoice.number).toBe('INV-2026-0001');
    expect(intra.body.invoice.totals).toMatchObject({ taxableAmount: 1000, cgst: 90, sgst: 90, igst: 0, grandTotal: 1180 });
    expect(intra.body.invoice.amountInWords).toBe('One Thousand One Hundred Eighty Rupees Only');
    expect(intra.body.invoice.supplyType).toBe('intra');

    const inter = await agent.post('/api/invoices').send({
      status: 'partial',
      invoiceDate: '2026-10-22',
      customerId: buyer.body.customer.id,
      placeOfSupplyStateCode: '27',
      items: [{ name: 'Cotton kurta', quantity: 1, rate: 1000, gstRate: 18, unit: 'pcs', productId: product.body.product.id }],
      initialPayment: { amount: 500, method: 'upi', paidAt: '2026-10-22' },
    });
    expect(inter.status, JSON.stringify(inter.body)).toBe(201);
    expect(inter.body.invoice.number).toBe('INV-2026-0002');
    expect(inter.body.invoice.totals.igst).toBe(180);
    expect(inter.body.invoice.totals.cgst).toBe(0);
    expect(inter.body.invoice.status).toBe('partial');
    expect(inter.body.invoice.amountDue).toBe(680);

    const duplicate = await agent.post('/api/invoices').send({
      status: 'unpaid',
      invoiceDate: '2026-10-22',
      number: 'INV-2026-0001',
      customerId: local.body.customer.id,
      placeOfSupplyStateCode: '08',
      items: [{ name: 'Cotton kurta', quantity: 1, rate: 1000, gstRate: 18 }],
    });
    expect(duplicate.status).toBe(409);

    await agent.put(`/api/products/${product.body.product.id}`).send({
      name: 'Cotton kurta',
      sellingPrice: 2000,
      gstRate: 5,
      hsnSac: '9999',
      unit: 'pcs',
      trackStock: true,
      stockQuantity: 10,
    });
    await agent.put('/api/business').send({
      name: 'Asha Stores Renamed',
      ownerName: 'Asha Rao',
      mobile: '9845012345',
      addressLine1: '99 New Road',
      city: 'Jaipur',
      stateCode: '08',
      pincode: '302001',
      gstin: '',
      pan: 'AAPFA1234L',
    });
    await agent.put(`/api/customers/${local.body.customer.id}`).send({ name: 'Jaipur Buyer Moved', stateCode: '27' });

    const saved = await agent.get(`/api/invoices/${intra.body.invoice.id}`);
    expect(saved.body.invoice.seller.name).toBe('Asha Stores');
    expect(saved.body.invoice.seller.gstin).toBe(gstin('08', 'AAPFA1234L'));
    expect(saved.body.invoice.seller.address.line1).toBe('12 Market Road');
    expect(saved.body.invoice.items[0].rate).toBe(1000);
    expect(saved.body.invoice.items[0].gstRate).toBe(18);
    expect(saved.body.invoice.items[0].hsnSac).toBe('6204');
    expect(saved.body.invoice.customer.name).toBe('Jaipur Buyer');
    expect(saved.body.invoice.customer.stateCode).toBe('08');
    expect(saved.body.invoice.totals.grandTotal).toBe(1180);

    await Product.updateOne({ _id: product.body.product.id }, { archived: true });
    const afterDelete = await agent.get(`/api/invoices/${intra.body.invoice.id}`);
    expect(afterDelete.body.invoice.items[0].name).toBe('Cotton kurta');

    const paid = await agent.post('/api/payments').send({
      invoiceId: inter.body.invoice.id,
      amount: 680,
      method: 'cash',
      paidAt: '2026-10-23',
    });
    expect(paid.body.invoice.status).toBe('paid');
    expect(paid.body.invoice.amountDue).toBe(0);

    const draft = await agent.post('/api/invoices').send({ status: 'draft', invoiceDate: '2026-10-22', items: [] });
    expect(draft.status).toBe(201);
    const emptyIssue = await agent.put(`/api/invoices/${draft.body.invoice.id}`).send({
      status: 'unpaid',
      invoiceDate: '2026-10-22',
      items: [],
    });
    expect(emptyIssue.status).toBe(400);

    const cancelled = await agent.post(`/api/invoices/${intra.body.invoice.id}/cancel`).send({ reason: 'Returned' });
    expect(cancelled.body.invoice.status).toBe('cancelled');
    const dash = await agent.get('/api/reports/dashboard');
    expect(dash.body.stats.totalSales).toBe(1180);
  });

  it('issues a plain bill when GSTIN is blank and rejects a bad GSTIN', async () => {
    const agent = await owner('plain@shop.test');
    const bad = await agent.put('/api/business').send({
      name: 'Plain Shop',
      ownerName: 'Asha Rao',
      mobile: '9845012345',
      addressLine1: '1 Lane',
      city: 'Jaipur',
      stateCode: '08',
      pincode: '302001',
      gstin: '08AAAAA0000A1Z5',
      pan: '',
    });
    expect(bad.status).toBe(400);

    await setupShop(agent, { gstin: '', pan: '', upiId: '' });
    const customer = await agent.post('/api/customers').send({ name: 'Walk-in', stateCode: '08' });
    const invoice = await agent.post('/api/invoices').send({
      status: 'paid',
      invoiceDate: '2026-10-22',
      customerId: customer.body.customer.id,
      placeOfSupplyStateCode: '27',
      items: [{ name: 'Button pack', quantity: 2, rate: 40, gstRate: 18, unit: 'box' }],
    });
    expect(invoice.status, JSON.stringify(invoice.body)).toBe(201);
    expect(invoice.body.invoice.isGstInvoice).toBe(false);
    expect(invoice.body.invoice.supplyType).toBe('non_gst');
    expect(invoice.body.invoice.totals.taxAmount).toBe(0);
    expect(invoice.body.invoice.totals.grandTotal).toBe(80);
    expect(invoice.body.invoice.seller.gstin).toBe('');
    expect(invoice.body.invoice.seller.documentTitle).toBe('Invoice');
    expect(invoice.body.invoice.status).toBe('paid');

    const html = await agent.get(`/api/invoices/${invoice.body.invoice.id}/html`);
    expect(html.text).not.toContain('GSTIN');
    expect(html.text).toContain('Button pack');
    expect(html.text).toContain('Eighty Rupees Only');
  });

  it('renders a PDF for a saved invoice', async () => {
    const agent = await owner('pdf@shop.test');
    await setupShop(agent);
    const customer = await agent.post('/api/customers').send({ name: 'PDF Buyer', stateCode: '08' });
    const invoice = await agent.post('/api/invoices').send({
      status: 'unpaid',
      invoiceDate: '2026-10-22',
      customerId: customer.body.customer.id,
      placeOfSupplyStateCode: '08',
      items: [{ name: 'Notebook', quantity: 1, rate: 100, gstRate: 0, unit: 'pcs' }],
    });
    const pdf = await agent.get(`/api/invoices/${invoice.body.invoice.id}/pdf`).buffer(true);
    expect(pdf.status, pdf.text?.slice?.(0, 200) || pdf.body?.toString?.().slice(0, 120)).toBe(200);
    expect(pdf.headers['content-type']).toContain('pdf');
    expect(pdf.body.subarray(0, 4).toString()).toBe('%PDF');
  });
});

describe('references stay queryable', () => {
  it('keeps customer billing history after the product price changes', async () => {
    const agent = await owner('history@shop.test');
    await setupShop(agent);
    const customer = await agent.post('/api/customers').send({ name: 'History Buyer', stateCode: '08' });
    const created = await agent.post('/api/invoices').send({
      status: 'unpaid',
      invoiceDate: '2026-10-22',
      customerId: customer.body.customer.id,
      placeOfSupplyStateCode: '08',
      items: [{ name: 'Old rate item', quantity: 1, rate: 500, gstRate: 5, unit: 'pcs' }],
    });
    const history = await agent.get(`/api/customers/${customer.body.customer.id}/invoices`);
    expect(history.body.invoices).toHaveLength(1);
    expect(history.body.invoices[0].grandTotal).toBe(created.body.invoice.totals.grandTotal);
    const stored = await Invoice.findById(created.body.invoice.id);
    expect(stored?.sellerSnapshot.gstin).toBeTruthy();
    await Business.updateOne({}, { gstin: '' });
    await Customer.updateOne({}, { billingAddress: { line1: 'Changed', city: 'Pune', state: 'Maharashtra', stateCode: '27', pincode: '411001' } });
    const again = await Invoice.findById(created.body.invoice.id);
    expect(again?.sellerSnapshot.gstin).toBe(stored?.sellerSnapshot.gstin);
    expect(again?.customerSnapshot.billingAddress.line1).not.toBe('Changed');
  });
});
