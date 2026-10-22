import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth, useMeta } from '../auth';
import { CustomerFields } from '../components/CustomerFields';
import { StateSelect } from '../components/StateSelect';
import { Badge, Button, Dialog, Field, PageHeader, SelectInput, Spinner, TextArea, TextInput } from '../components/ui';
import { api, authHeader } from '../lib/api';
import { customerPayload, emptyCustomer, type CustomerDraft } from '../lib/customer';
import { addDays, inr, todayIn } from '../lib/format';
import { fail, fieldErrors } from '../lib/toast';
import type { CalcResult, Customer, InvoiceDetail, Product, TaxRate } from '../types';

interface Line {
  key: string;
  productId: string;
  name: string;
  sku: string;
  hsnSac: string;
  description: string;
  unit: string;
  quantity: string;
  rate: string;
  discountMode: 'amount' | 'percent';
  discountValue: string;
  gstRate: string;
}

function blankLine(gstRate = '0'): Line {
  return {
    key: crypto.randomUUID(),
    productId: '',
    name: '',
    sku: '',
    hsnSac: '',
    description: '',
    unit: 'pcs',
    quantity: '1',
    rate: '',
    discountMode: 'amount',
    discountValue: '0',
    gstRate,
  };
}

export function InvoiceForm() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const presetProduct = searchParams.get('product') || '';
  const editing = Boolean(id);
  const navigate = useNavigate();
  const { business, settings } = useAuth();
  const meta = useMeta();
  const zone = settings?.defaults.timezone || 'Asia/Kolkata';
  const [loading, setLoading] = useState(editing);
  const [busy, setBusy] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [rates, setRates] = useState<TaxRate[]>([]);
  const [customerMode, setCustomerMode] = useState<'existing' | 'new'>('existing');
  const [customerId, setCustomerId] = useState('');
  const [draft, setDraft] = useState<CustomerDraft>(emptyCustomer(business?.stateCode || ''));
  const [customerOpen, setCustomerOpen] = useState(false);
  const [number, setNumber] = useState('');
  const [numberTouched, setNumberTouched] = useState(false);
  const [invoiceDate, setInvoiceDate] = useState(todayIn(zone));
  const [dueTouched, setDueTouched] = useState(false);
  const [dueDate, setDueDate] = useState('');
  const [place, setPlace] = useState(business?.stateCode || '');
  const [placeTouched, setPlaceTouched] = useState(false);
  const [lines, setLines] = useState<Line[]>([blankLine()]);
  const [discountMode, setDiscountMode] = useState<'amount' | 'percent'>('amount');
  const [discountValue, setDiscountValue] = useState('0');
  const [notes, setNotes] = useState(settings?.defaults.notes || '');
  const [terms, setTerms] = useState(settings?.defaults.terms || '');
  const [footer, setFooter] = useState(settings?.defaults.footer || '');
  const [payStatus, setPayStatus] = useState<'unpaid' | 'partial' | 'paid'>('unpaid');
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('cash');
  const [payRef, setPayRef] = useState('');
  const [calc, setCalc] = useState<CalcResult | null>(null);
  const [calcError, setCalcError] = useState('');
  const [preview, setPreview] = useState('');
  const [gstOn, setGstOn] = useState(Boolean(business?.gstEnabled));
  const [existingStatus, setExistingStatus] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    Promise.all([
      api<{ customers: Customer[] }>('/api/customers?limit=100'),
      api<{ products: Product[] }>('/api/products?limit=100'),
      api<{ taxRates: TaxRate[] }>('/api/tax-rates'),
    ])
      .then(([customerData, productData, rateData]) => {
        setCustomers(customerData.customers);
        setProducts(productData.products);
        setRates(rateData.taxRates);
      })
      .catch(fail);
  }, []);

  useEffect(() => {
    if (editing || !presetProduct || products.length === 0) return;
    const product = products.find((item) => item.id === presetProduct);
    if (!product) return;
    setLines((current) => {
      if (current.some((line) => line.productId === product.id || line.name.trim())) return current;
      return [
        {
          key: crypto.randomUUID(),
          productId: product.id,
          name: product.name,
          sku: product.sku,
          hsnSac: product.hsnSac,
          description: product.description,
          unit: product.unit,
          quantity: '1',
          rate: String(product.sellingPrice),
          discountMode: 'amount',
          discountValue: '0',
          gstRate: String(product.gstRate),
        },
      ];
    });
  }, [editing, presetProduct, products]);

  useEffect(() => {
    if (!id) return;
    api<{ invoice: InvoiceDetail }>(`/api/invoices/${id}`)
      .then(({ invoice }) => {
        setNumber(invoice.number);
        setNumberTouched(true);
        setInvoiceDate(invoice.invoiceDate);
        setDueDate(invoice.dueDate);
        setDueTouched(true);
        setPlace(invoice.placeOfSupply?.stateCode || '');
        setPlaceTouched(true);
        setCustomerId(invoice.customerId);
        setDiscountMode(invoice.invoiceDiscountMode);
        setDiscountValue(String(invoice.invoiceDiscountValue || 0));
        setNotes(invoice.notes);
        setTerms(invoice.terms);
        setFooter(invoice.footer);
        setGstOn(invoice.isGstInvoice);
        setExistingStatus(invoice.status);
        setLines(
          invoice.items.length
            ? invoice.items.map((item) => ({
                key: item.id || crypto.randomUUID(),
                productId: item.productId || '',
                name: item.name,
                sku: item.sku,
                hsnSac: item.hsnSac,
                description: item.description,
                unit: item.unit,
                quantity: String(item.quantity),
                rate: String(item.rate),
                discountMode: item.discountMode,
                discountValue: String(item.discountValue),
                gstRate: String(item.gstRate),
              }))
            : [blankLine()],
        );
      })
      .catch((error) => {
        fail(error);
        navigate('/invoices');
      })
      .finally(() => setLoading(false));
  }, [id, navigate]);

  useEffect(() => {
    if (editing || dueTouched) return;
    const days = settings?.defaults.paymentTermsDays ?? 0;
    setDueDate(days ? addDays(invoiceDate, days) : '');
  }, [invoiceDate, editing, dueTouched, settings?.defaults.paymentTermsDays]);

  useEffect(() => {
    if (editing || numberTouched) return;
    api<{ number: string }>(`/api/invoices/next-number?date=${invoiceDate}`)
      .then((data) => setNumber(data.number))
      .catch(() => undefined);
  }, [invoiceDate, editing, numberTouched]);

  const billable = useMemo(
    () => lines.filter((line) => line.name.trim() && Number(line.quantity) > 0 && line.rate !== '' && Number(line.rate) >= 0),
    [lines],
  );

  useEffect(() => {
    const handle = window.setTimeout(() => {
      if (!billable.length) {
        setCalc(null);
        setCalcError('');
        return;
      }
      api<CalcResult>('/api/invoices/calculate', {
        method: 'POST',
        body: JSON.stringify({
          lines: billable.map((line) => ({
            quantity: Number(line.quantity),
            rate: Number(line.rate),
            discountMode: line.discountMode,
            discountValue: Number(line.discountValue) || 0,
            gstRate: gstOn ? Number(line.gstRate) || 0 : 0,
            hsnSac: line.hsnSac,
          })),
          invoiceDiscountMode: discountMode,
          invoiceDiscountValue: Number(discountValue) || 0,
          placeOfSupplyStateCode: place || business?.stateCode || '',
          gstApplicable: gstOn,
        }),
      })
        .then((data) => {
          setCalc(data);
          setCalcError('');
        })
        .catch((error) => {
          setCalc(null);
          setCalcError(error instanceof Error ? error.message : 'Could not calculate this bill.');
        });
    }, 250);
    return () => window.clearTimeout(handle);
  }, [billable, discountMode, discountValue, place, gstOn, business?.stateCode]);

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function chooseProduct(key: string, productId: string) {
    const product = products.find((item) => item.id === productId);
    if (!product) {
      updateLine(key, { productId: '' });
      return;
    }
    updateLine(key, {
      productId,
      name: product.name,
      sku: product.sku,
      hsnSac: product.hsnSac,
      description: product.description,
      unit: product.unit,
      rate: String(product.sellingPrice),
      gstRate: String(product.gstRate),
    });
  }

  function chooseCustomer(nextId: string) {
    setCustomerId(nextId);
    const customer = customers.find((item) => item.id === nextId);
    if (customer && !placeTouched) setPlace(customer.stateCode);
  }

  function rateOptions(current: string) {
    const active = rates.filter((rate) => rate.active);
    const value = Number(current);
    if (!Number.isNaN(value) && !active.some((rate) => rate.rate === value)) {
      return [...active, { id: `extra-${current}`, name: `GST ${current}%`, rate: value, active: false }];
    }
    return active;
  }

  function body(status: 'draft' | 'unpaid' | 'partial' | 'paid') {
    const items = lines
      .filter((line) => line.name.trim())
      .map((line) => ({
        productId: line.productId || null,
        name: line.name.trim(),
        sku: line.sku,
        hsnSac: line.hsnSac,
        description: line.description,
        unit: line.unit || 'pcs',
        quantity: Number(line.quantity),
        rate: Number(line.rate) || 0,
        discountMode: line.discountMode,
        discountValue: Number(line.discountValue) || 0,
        gstRate: gstOn ? Number(line.gstRate) || 0 : 0,
      }));
    const grand = calc?.grandTotal ?? 0;
    const received = status === 'paid' ? grand : status === 'partial' ? Number(payAmount) : 0;
    return {
      status: editing && existingStatus && existingStatus !== 'draft' ? existingStatus : status,
      invoiceDate,
      dueDate,
      customerId: customerMode === 'existing' ? customerId || null : null,
      newCustomer: customerMode === 'new' && draft.name.trim() ? customerPayload(draft) : undefined,
      placeOfSupplyStateCode: place,
      items,
      invoiceDiscountMode: discountMode,
      invoiceDiscountValue: Number(discountValue) || 0,
      notes,
      terms,
      footer,
      number,
      initialPayment:
        !editing && (status === 'paid' || status === 'partial')
          ? { amount: received, method: payMethod, reference: payRef, notes: '', paidAt: invoiceDate }
          : undefined,
    };
  }

  async function save(status: 'draft' | 'unpaid' | 'partial' | 'paid') {
    setBusy(true);
    setErrors({});
    try {
      const path = editing ? `/api/invoices/${id}` : '/api/invoices';
      const result = await api<{ invoice: InvoiceDetail; warnings?: string[] }>(path, {
        method: editing ? 'PUT' : 'POST',
        body: JSON.stringify(body(status)),
      });
      for (const warning of result.warnings || []) toast(warning);
      toast.success(status === 'draft' ? 'Draft saved.' : 'Invoice saved.');
      navigate(`/invoices/${result.invoice.id}`);
    } catch (error) {
      setErrors(fieldErrors(error));
      fail(error);
    } finally {
      setBusy(false);
    }
  }

  async function openPreview() {
    setBusy(true);
    try {
      const ready = (customerMode === 'existing' ? customerId : draft.name.trim()) && billable.length > 0;
      const response = await fetch('/api/invoices/preview', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ ...body(ready ? 'unpaid' : 'draft'), ...(id ? { invoiceId: id } : {}) }),
      });
      const html = await response.text();
      if (!response.ok) {
        const data = JSON.parse(html);
        throw new Error(data?.error?.message || 'Preview failed.');
      }
      setPreview(html);
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }

  async function createCustomer(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const data = await api<{ customer: Customer }>('/api/customers', {
        method: 'POST',
        body: JSON.stringify(customerPayload(draft)),
      });
      setCustomers((current) => [...current, data.customer].sort((a, b) => a.name.localeCompare(b.name)));
      setCustomerMode('existing');
      setCustomerId(data.customer.id);
      if (!placeTouched) setPlace(data.customer.stateCode);
      setCustomerOpen(false);
      setDraft(emptyCustomer(business?.stateCode || ''));
      toast.success('Customer added.');
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Spinner />;

  const supply = calc?.supplyType === 'inter' ? 'IGST — different state' : calc?.supplyType === 'intra' ? 'CGST + SGST — same state' : gstOn ? 'Waiting for items' : 'Non-GST bill';
  const activeRates = rates.filter((rate) => rate.active);

  return (
    <div>
      <PageHeader
        title={editing ? `Edit ${number || 'invoice'}` : 'Create invoice'}
        lede={gstOn ? 'Pick a customer, add items, and the tax splits itself.' : 'This shop has no GSTIN, so this bill will not show GST.'}
        action={
          <Link to="/invoices" className="text-sm font-semibold text-clay-dark">
            All invoices
          </Link>
        }
      />
      {existingStatus ? (
        <p className="mb-4">
          <Badge status={existingStatus} label={existingStatus} />
        </p>
      ) : null}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid gap-4">
          <section className="rounded-3xl border border-line bg-card p-4">
            <h2 className="font-serif text-2xl">Invoice</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Invoice number" error={errors.number}>
                <TextInput
                  value={number}
                  onChange={(event) => {
                    setNumberTouched(true);
                    setNumber(event.target.value);
                  }}
                />
              </Field>
              <Field label="Invoice date" error={errors.invoiceDate}>
                <TextInput type="date" value={invoiceDate} onChange={(event) => setInvoiceDate(event.target.value)} required />
              </Field>
              <Field label="Due date" error={errors.dueDate}>
                <TextInput
                  type="date"
                  value={dueDate}
                  onChange={(event) => {
                    setDueTouched(true);
                    setDueDate(event.target.value);
                  }}
                />
              </Field>
              <Field label="Place of supply" error={errors.placeOfSupplyStateCode}>
                <StateSelect
                  value={place}
                  onChange={(code) => {
                    setPlaceTouched(true);
                    setPlace(code);
                  }}
                />
              </Field>
            </div>
            <p className="mt-2 text-xs text-muted">
              Your state is {business?.state} ({business?.stateCode}). {supply}.
            </p>
          </section>

          <section className="rounded-3xl border border-line bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-serif text-2xl">Customer</h2>
              <Button variant="secondary" onClick={() => setCustomerOpen(true)}>
                <Plus size={16} /> Add customer
              </Button>
            </div>
            <div className="mt-3 flex gap-2 text-sm">
              <button type="button" className={customerMode === 'existing' ? 'font-semibold' : 'text-muted'} onClick={() => setCustomerMode('existing')}>
                Existing
              </button>
              <button type="button" className={customerMode === 'new' ? 'font-semibold' : 'text-muted'} onClick={() => setCustomerMode('new')}>
                Type a new one on this bill
              </button>
            </div>
            {customerMode === 'existing' ? (
              <div className="mt-3">
                <Field label="Customer" error={errors.customerId}>
                  <SelectInput value={customerId} onChange={(event) => chooseCustomer(event.target.value)}>
                    <option value="">Choose a customer</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name}
                        {customer.mobile ? ` · ${customer.mobile}` : ''}
                        {customer.gstin ? ` · ${customer.gstin}` : ''}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
              </div>
            ) : (
              <div className="mt-3">
                <CustomerFields value={draft} onChange={setDraft} errors={errors} />
              </div>
            )}
          </section>

          <section className="rounded-3xl border border-line bg-card p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-2xl">Items</h2>
              <Button variant="secondary" onClick={() => setLines((current) => [...current, blankLine(activeRates[0] ? String(activeRates[0].rate) : '0')])}>
                <Plus size={16} /> Add item
              </Button>
            </div>
            {errors.items ? <p className="mt-2 text-sm text-clay-dark">{errors.items}</p> : null}
            <div className="mt-3 grid gap-3">
              {lines.map((line) => {
                const index = billable.findIndex((item) => item.key === line.key);
                const row = index >= 0 ? calc?.lines[index] : undefined;
                return (
                  <article key={line.key} className="rounded-2xl border border-line p-3">
                    <div className="grid gap-2 md:grid-cols-6">
                      <div className="md:col-span-2">
                        <Field label="Product / service">
                          <SelectInput value={line.productId} onChange={(event) => chooseProduct(line.key, event.target.value)}>
                            <option value="">Custom item</option>
                            {products.map((product) => (
                              <option key={product.id} value={product.id}>
                                {product.name}
                              </option>
                            ))}
                          </SelectInput>
                        </Field>
                        <TextInput className="mt-2" placeholder="Item name" value={line.name} onChange={(event) => updateLine(line.key, { name: event.target.value })} />
                      </div>
                      <Field label="HSN/SAC">
                        <TextInput value={line.hsnSac} onChange={(event) => updateLine(line.key, { hsnSac: event.target.value })} />
                      </Field>
                      <Field label="Qty">
                        <TextInput inputMode="decimal" value={line.quantity} onChange={(event) => updateLine(line.key, { quantity: event.target.value })} />
                      </Field>
                      <Field label="Unit">
                        <SelectInput value={line.unit} onChange={(event) => updateLine(line.key, { unit: event.target.value })}>
                          {(meta?.units ?? ['pcs']).map((unit) => (
                            <option key={unit} value={unit}>
                              {unit}
                            </option>
                          ))}
                          {line.unit && !(meta?.units ?? []).includes(line.unit) ? <option value={line.unit}>{line.unit}</option> : null}
                        </SelectInput>
                      </Field>
                      <Field label={settings?.defaults.priceMode === 'inclusive' && !editing ? 'Rate (incl. GST)' : 'Rate'}>
                        <TextInput inputMode="decimal" value={line.rate} onChange={(event) => updateLine(line.key, { rate: event.target.value })} />
                      </Field>
                    </div>
                    <div className="mt-2 grid gap-2 md:grid-cols-6">
                      <Field label="Discount">
                        <TextInput inputMode="decimal" value={line.discountValue} onChange={(event) => updateLine(line.key, { discountValue: event.target.value })} />
                      </Field>
                      <Field label="Disc. type">
                        <SelectInput value={line.discountMode} onChange={(event) => updateLine(line.key, { discountMode: event.target.value as 'amount' | 'percent' })}>
                          <option value="amount">₹</option>
                          <option value="percent">%</option>
                        </SelectInput>
                      </Field>
                      {gstOn ? (
                        <Field label="GST rate">
                          <SelectInput value={line.gstRate} onChange={(event) => updateLine(line.key, { gstRate: event.target.value })}>
                            {rateOptions(line.gstRate).map((rate) => (
                              <option key={rate.id} value={String(rate.rate)}>
                                {rate.name}
                              </option>
                            ))}
                          </SelectInput>
                        </Field>
                      ) : null}
                      <div className="text-sm md:col-span-2">
                        <p className="text-xs text-muted">Taxable {row ? inr(row.taxableAmount) : '—'}</p>
                        {gstOn ? (
                          <p className="text-xs text-muted">
                            {calc?.supplyType === 'inter'
                              ? `IGST ${row ? inr(row.igst) : '—'}`
                              : `CGST ${row ? inr(row.cgst) : '—'} · SGST ${row ? inr(row.sgst) : '—'}`}
                          </p>
                        ) : null}
                        <p className="font-semibold tabular">{row ? inr(row.total) : '—'}</p>
                      </div>
                      <div className="flex items-end">
                        <Button variant="ghost" aria-label="Remove item" onClick={() => setLines((current) => (current.length === 1 ? [blankLine()] : current.filter((item) => item.key !== line.key)))}>
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-muted">You choose the GST rate and HSN/SAC. KS Sports only calculates the split you selected.</p>
          </section>

          <section className="rounded-3xl border border-line bg-card p-4">
            <h2 className="font-serif text-2xl">Notes</h2>
            <div className="mt-3 grid gap-3">
              <Field label="Notes on this invoice">
                <TextArea value={notes} onChange={(event) => setNotes(event.target.value)} />
              </Field>
              <Field label="Terms & conditions">
                <TextArea value={terms} onChange={(event) => setTerms(event.target.value)} />
              </Field>
              <Field label="Footer">
                <TextInput value={footer} onChange={(event) => setFooter(event.target.value)} />
              </Field>
            </div>
          </section>
        </div>

        <aside className="grid gap-3 xl:sticky xl:top-20">
          <section className="rounded-3xl border border-line bg-card p-4">
            <h2 className="font-serif text-2xl">Total</h2>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <span>Item discount</span>
              <span className="text-right tabular">{inr(calc?.itemDiscount)}</span>
              <span className="col-span-2 grid grid-cols-[1fr_88px_72px] items-center gap-2">
                <span>Invoice discount</span>
                <TextInput value={discountValue} onChange={(event) => setDiscountValue(event.target.value)} inputMode="decimal" />
                <SelectInput value={discountMode} onChange={(event) => setDiscountMode(event.target.value as 'amount' | 'percent')}>
                  <option value="amount">₹</option>
                  <option value="percent">%</option>
                </SelectInput>
              </span>
              <span>Taxable</span>
              <span className="text-right tabular">{inr(calc?.taxableAmount)}</span>
              {gstOn && calc?.supplyType !== 'inter' ? (
                <>
                  <span>CGST</span>
                  <span className="text-right tabular">{inr(calc?.cgst)}</span>
                  <span>SGST</span>
                  <span className="text-right tabular">{inr(calc?.sgst)}</span>
                </>
              ) : null}
              {gstOn && calc?.supplyType === 'inter' ? (
                <>
                  <span>IGST</span>
                  <span className="text-right tabular">{inr(calc?.igst)}</span>
                </>
              ) : null}
              <span>Round off</span>
              <span className="text-right tabular">{inr(calc?.roundOff)}</span>
            </div>
            <p className="mt-3 font-serif text-3xl tabular">{inr(calc?.grandTotal)}</p>
            <p className="mt-1 text-xs text-muted">{calc?.amountInWords || 'Add an item to see the amount in words.'}</p>
            {calcError ? <p className="mt-2 text-xs text-clay-dark">{calcError}</p> : null}
          </section>

          {!editing ? (
            <section className="rounded-3xl border border-line bg-card p-4">
              <Field label="Payment status">
                <SelectInput value={payStatus} onChange={(event) => setPayStatus(event.target.value as 'unpaid' | 'partial' | 'paid')}>
                  <option value="unpaid">Unpaid</option>
                  <option value="partial">Partially paid</option>
                  <option value="paid">Paid</option>
                </SelectInput>
              </Field>
              {payStatus !== 'unpaid' ? (
                <div className="mt-3 grid gap-2">
                  {payStatus === 'partial' ? (
                    <Field label="Amount received">
                      <TextInput inputMode="decimal" value={payAmount} onChange={(event) => setPayAmount(event.target.value)} />
                    </Field>
                  ) : (
                    <p className="text-sm text-muted">Records {inr(calc?.grandTotal)} as received.</p>
                  )}
                  <Field label="Method">
                    <SelectInput value={payMethod} onChange={(event) => setPayMethod(event.target.value)}>
                      {(meta?.paymentMethods ?? []).map((method) => (
                        <option key={method.id} value={method.id}>
                          {method.label}
                        </option>
                      ))}
                    </SelectInput>
                  </Field>
                  <Field label="Reference">
                    <TextInput value={payRef} onChange={(event) => setPayRef(event.target.value)} placeholder="UPI ref, cheque no." />
                  </Field>
                </div>
              ) : null}
            </section>
          ) : (
            <p className="text-xs text-muted">Payments already on this invoice stay as they are. Record a new one from the invoice page.</p>
          )}

          <div className="grid gap-2">
            <Button disabled={busy || (billable.length > 0 && !calc)} onClick={() => void save(editing && existingStatus !== 'draft' ? 'unpaid' : payStatus)}>
              {busy ? 'Saving…' : editing && existingStatus === 'draft' ? 'Issue invoice' : editing ? 'Save changes' : 'Save invoice'}
            </Button>
            {(!editing || existingStatus === 'draft') && (
              <Button variant="secondary" disabled={busy} onClick={() => void save('draft')}>
                Save draft
              </Button>
            )}
            <Button variant="ghost" disabled={busy} onClick={() => void openPreview()}>
              Preview
            </Button>
          </div>
        </aside>
      </div>

      <Dialog open={customerOpen} title="New customer" onClose={() => setCustomerOpen(false)} wide>
        <form onSubmit={createCustomer} className="grid gap-3">
          <CustomerFields value={draft} onChange={setDraft} />
          <Button type="submit" disabled={busy}>
            Save customer
          </Button>
        </form>
      </Dialog>

      <Dialog open={Boolean(preview)} title="Invoice preview" onClose={() => setPreview('')} wide>
        <iframe title="Invoice preview" className="h-[70vh] w-full rounded-xl border border-line bg-white" srcDoc={preview} />
        <p className="mt-2 text-xs text-muted">This is the same layout as the PDF.</p>
      </Dialog>
    </div>
  );
}
