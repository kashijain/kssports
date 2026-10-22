import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuth, useMeta } from '../auth';
import { Button, Dialog, Empty, Field, PageHeader, SelectInput, Spinner, TextArea, TextInput } from '../components/ui';
import { api } from '../lib/api';
import { inr } from '../lib/format';
import { fail } from '../lib/toast';
import type { Product, TaxRate } from '../types';

interface Draft {
  name: string;
  sku: string;
  hsnSac: string;
  category: string;
  unit: string;
  sellingPrice: string;
  gstRate: string;
  trackStock: boolean;
  stockQuantity: string;
  lowStockThreshold: string;
  description: string;
}

function emptyDraft(rate = '0'): Draft {
  return {
    name: '',
    sku: '',
    hsnSac: '',
    category: '',
    unit: 'pcs',
    sellingPrice: '',
    gstRate: rate,
    trackStock: false,
    stockQuantity: '',
    lowStockThreshold: '5',
    description: '',
  };
}

export function Products() {
  const { business, settings } = useAuth();
  const meta = useMeta();
  const [rows, setRows] = useState<Product[] | null>(null);
  const [rates, setRates] = useState<TaxRate[]>([]);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function load(query = q) {
    const params = new URLSearchParams({ limit: '100' });
    if (query.trim()) params.set('q', query.trim());
    Promise.all([
      api<{ products: Product[] }>(`/api/products?${params}`),
      api<{ taxRates: TaxRate[] }>('/api/tax-rates'),
    ])
      .then(([products, tax]) => {
        setRows(products.products);
        setRates(tax.taxRates);
        setError('');
      })
      .catch((err) => {
        setError('Products could not be loaded.');
        fail(err);
      });
  }

  useEffect(() => {
    const handle = window.setTimeout(() => load(q), 200);
    return () => window.clearTimeout(handle);
  }, [q]);

  function startNew() {
    const first = rates.find((rate) => rate.active);
    setEditing(null);
    setDraft(emptyDraft(first ? String(first.rate) : '0'));
    setOpen(true);
  }

  function startEdit(product: Product) {
    setEditing(product);
    setDraft({
      name: product.name,
      sku: product.sku,
      hsnSac: product.hsnSac,
      category: product.category,
      unit: product.unit,
      sellingPrice: String(product.sellingPrice),
      gstRate: String(product.gstRate),
      trackStock: product.trackStock,
      stockQuantity: product.stockQuantity === null ? '' : String(product.stockQuantity),
      lowStockThreshold: String(product.lowStockThreshold),
      description: product.description,
    });
    setOpen(true);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const payload = {
        name: draft.name,
        sku: draft.sku,
        hsnSac: draft.hsnSac,
        category: draft.category,
        unit: draft.unit,
        sellingPrice: Number(draft.sellingPrice),
        gstRate: business?.gstEnabled ? Number(draft.gstRate) : 0,
        trackStock: draft.trackStock,
        stockQuantity: draft.trackStock ? Number(draft.stockQuantity || 0) : null,
        lowStockThreshold: Number(draft.lowStockThreshold || settings?.defaults.lowStockThreshold || 5),
        description: draft.description,
      };
      const path = editing ? `/api/products/${editing.id}` : '/api/products';
      await api(path, { method: editing ? 'PUT' : 'POST', body: JSON.stringify(payload) });
      toast.success(editing ? 'Product updated.' : 'Product added.');
      setOpen(false);
      load();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function remove(product: Product) {
    if (!window.confirm(`Remove ${product.name}? Invoices already issued keep this item as it was billed.`)) return;
    try {
      await api(`/api/products/${product.id}`, { method: 'DELETE' });
      toast.success('Product removed.');
      load();
    } catch (err) {
      fail(err);
    }
  }

  const active = rates.filter((rate) => rate.active);

  return (
    <div>
      <PageHeader
        title="Products & services"
        lede={business?.gstEnabled ? 'Prices follow your invoice setting: tax extra, or tax included. GST rates come from Settings.' : 'Without a GSTIN, new bills ignore GST even if a product has a rate.'}
        action={<Button onClick={startNew}>Add product</Button>}
      />
      <TextInput className="mb-4 max-w-md" placeholder="Search name, SKU, HSN, category" value={q} onChange={(event) => setQ(event.target.value)} />
      {error ? <Empty title="Could not load products" body={error} action={<Button variant="secondary" onClick={() => load()}>Try again</Button>} /> : null}
      {!rows && !error ? <Spinner /> : null}
      {rows && rows.length === 0 ? <Empty title="Nothing to bill yet" body="Add a product or a service such as stitching, repair, or a day’s labour." action={<Button onClick={startNew}>Add product</Button>} /> : null}
      {rows && rows.length > 0 ? (
        <div className="overflow-x-auto rounded-3xl border border-line bg-card">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Item</th>
                <th>HSN/SAC</th>
                <th>Price</th>
                <th>GST</th>
                <th>Stock</th>
                <th className="px-4"> </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((product) => (
                <tr key={product.id} className="border-t border-line">
                  <td className="px-4 py-3">
                    <p className="font-semibold">{product.name}</p>
                    <p className="text-xs text-muted">{[product.sku, product.category, product.unit].filter(Boolean).join(' · ')}</p>
                  </td>
                  <td>{product.hsnSac || '—'}</td>
                  <td className="tabular">{inr(product.sellingPrice)}</td>
                  <td>{product.gstRate}%</td>
                  <td>
                    {product.trackStock ? (
                      <span className={product.stockQuantity !== null && product.stockQuantity <= product.lowStockThreshold ? 'text-clay-dark' : ''}>
                        {product.stockQuantity} {product.unit}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4">
                    <div className="flex gap-2">
                      <Button variant="secondary" onClick={() => startEdit(product)}>
                        Edit
                      </Button>
                      <Button variant="ghost" onClick={() => void remove(product)}>
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <Dialog open={open} title={editing ? 'Edit item' : 'New item'} onClose={() => setOpen(false)} wide>
        <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <TextInput value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required />
          </Field>
          <Field label="SKU">
            <TextInput value={draft.sku} onChange={(event) => setDraft({ ...draft, sku: event.target.value })} />
          </Field>
          <Field label="HSN/SAC">
            <TextInput value={draft.hsnSac} onChange={(event) => setDraft({ ...draft, hsnSac: event.target.value })} />
          </Field>
          <Field label="Category">
            <TextInput value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} />
          </Field>
          <Field label="Unit">
            <SelectInput value={draft.unit} onChange={(event) => setDraft({ ...draft, unit: event.target.value })}>
              {(meta?.units ?? ['pcs']).map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label={settings?.defaults.priceMode === 'inclusive' ? 'Selling price (incl. GST)' : 'Selling price'}>
            <TextInput inputMode="decimal" value={draft.sellingPrice} onChange={(event) => setDraft({ ...draft, sellingPrice: event.target.value })} required />
          </Field>
          {business?.gstEnabled ? (
            <Field label="GST rate">
              <SelectInput value={draft.gstRate} onChange={(event) => setDraft({ ...draft, gstRate: event.target.value })}>
                {active.map((rate) => (
                  <option key={rate.id} value={String(rate.rate)}>
                    {rate.name}
                  </option>
                ))}
                {!active.some((rate) => String(rate.rate) === draft.gstRate) ? <option value={draft.gstRate}>{draft.gstRate}%</option> : null}
              </SelectInput>
            </Field>
          ) : null}
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={draft.trackStock} onChange={(event) => setDraft({ ...draft, trackStock: event.target.checked })} />
            Track stock quantity
          </label>
          {draft.trackStock ? (
            <>
              <Field label="Stock quantity">
                <TextInput inputMode="decimal" value={draft.stockQuantity} onChange={(event) => setDraft({ ...draft, stockQuantity: event.target.value })} />
              </Field>
              <Field label="Low-stock reminder">
                <TextInput inputMode="decimal" value={draft.lowStockThreshold} onChange={(event) => setDraft({ ...draft, lowStockThreshold: event.target.value })} />
              </Field>
            </>
          ) : null}
          <div className="sm:col-span-2">
            <Field label="Description">
              <TextArea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
