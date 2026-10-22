import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth, useMeta } from '../auth';
import { Button, Dialog, Empty, Field, PageHeader, SelectInput, Spinner, TextArea, TextInput } from '../components/ui';
import { api, downloadFile } from '../lib/api';
import { inr } from '../lib/format';
import { fail } from '../lib/toast';
import type { Product, TaxRate } from '../types';

interface Draft {
  name: string;
  sku: string;
  hsnSac: string;
  category: string;
  subCategory: string;
  brand: string;
  unit: string;
  sellingPrice: string;
  purchasePrice: string;
  wholesalePrice: string;
  gstRate: string;
  trackStock: boolean;
  stockQuantity: string;
  lowStockThreshold: string;
  description: string;
  status: 'active' | 'inactive';
}

function emptyDraft(rate = '0'): Draft {
  return {
    name: '',
    sku: '',
    hsnSac: '',
    category: '',
    subCategory: '',
    brand: 'KS Sports',
    unit: 'pcs',
    sellingPrice: '',
    purchasePrice: '',
    wholesalePrice: '',
    gstRate: rate,
    trackStock: false,
    stockQuantity: '',
    lowStockThreshold: '5',
    description: '',
    status: 'active',
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
  const [photo, setPhoto] = useState<File | null>(null);
  const [picked, setPicked] = useState<string[]>([]);

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
    setPhoto(null);
    setOpen(true);
  }

  function startEdit(product: Product) {
    setEditing(product);
    setDraft({
      name: product.name,
      sku: product.sku,
      hsnSac: product.hsnSac,
      category: product.category,
      subCategory: product.subCategory || '',
      brand: product.brand || '',
      unit: product.unit,
      sellingPrice: String(product.sellingPrice),
      purchasePrice: product.purchasePrice == null ? '' : String(product.purchasePrice),
      wholesalePrice: product.wholesalePrice == null ? '' : String(product.wholesalePrice),
      gstRate: String(product.gstRate),
      trackStock: product.trackStock,
      stockQuantity: product.stockQuantity === null ? '' : String(product.stockQuantity),
      lowStockThreshold: String(product.lowStockThreshold),
      description: product.description,
      status: product.status || 'active',
    });
    setPhoto(null);
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
        subCategory: draft.subCategory,
        brand: draft.brand,
        unit: draft.unit,
        sellingPrice: Number(draft.sellingPrice),
        purchasePrice: draft.purchasePrice === '' ? null : Number(draft.purchasePrice),
        wholesalePrice: draft.wholesalePrice === '' ? null : Number(draft.wholesalePrice),
        gstRate: business?.gstEnabled ? Number(draft.gstRate) : 0,
        status: draft.status,
        trackStock: draft.trackStock,
        stockQuantity: draft.trackStock ? Number(draft.stockQuantity || 0) : null,
        lowStockThreshold: Number(draft.lowStockThreshold || settings?.defaults.lowStockThreshold || 5),
        description: draft.description,
      };
      const path = editing ? `/api/products/${editing.id}` : '/api/products';
      const saved = await api<{ product: Product }>(path, { method: editing ? 'PUT' : 'POST', body: JSON.stringify(payload) });
      if (photo) {
        const body = new FormData();
        body.append('file', photo);
        await api(`/api/products/${saved.product.id}/images`, { method: 'POST', body });
      }
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
  const chosen = picked.length && rows ? rows.filter((product) => picked.includes(product.id)) : rows || [];

  async function downloadCatalogFor(product: Product, mode: 'retail' | 'wholesale') {
    if (mode === 'wholesale' && product.wholesalePrice == null) {
      toast.error('Add a wholesale price before downloading that catalog.');
      return;
    }
    try {
      await downloadFile(`/api/catalog/pdf?priceMode=${mode}&ids=${product.id}`, `${product.sku || 'product'}-${mode}.pdf`);
    } catch (err) {
      fail(err);
    }
  }

  async function downloadCatalog(mode: 'retail' | 'wholesale') {
    const list = mode === 'wholesale' ? chosen.filter((product) => product.wholesalePrice != null) : chosen;
    if (!list.length) {
      toast.error(mode === 'wholesale' ? 'Add a wholesale price before downloading that catalog.' : 'Add a product first.');
      return;
    }
    const params = new URLSearchParams({ priceMode: mode, ids: list.map((product) => product.id).join(',') });
    try {
      await downloadFile(`/api/catalog/pdf?${params}`, `ks-sports-${mode}-catalog.pdf`);
    } catch (err) {
      fail(err);
    }
  }

  return (
    <div>
      <PageHeader
        title="Products"
        lede="One list for every KS Sports product. Add a photo, a retail price, and a wholesale price. The retail catalog PDF uses retail prices. The wholesale catalog PDF uses wholesale prices."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void downloadCatalog('retail')}>Retail catalog PDF</Button>
            <Button variant="secondary" onClick={() => void downloadCatalog('wholesale')}>Wholesale catalog PDF</Button>
            <Button onClick={startNew}>Add product</Button>
          </div>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <TextInput className="max-w-md" placeholder="Search name, SKU, HSN, category" value={q} onChange={(event) => setQ(event.target.value)} />
        {rows && rows.length > 0 ? (
          <button type="button" className="text-sm font-semibold" onClick={() => setPicked(picked.length === rows.length ? [] : rows.map((product) => product.id))}>
            {picked.length === rows.length ? 'Clear selection' : 'Select all'}
          </button>
        ) : null}
      </div>
      {error ? <Empty title="Could not load products" body={error} action={<Button variant="secondary" onClick={() => load()}>Try again</Button>} /> : null}
      {!rows && !error ? <Spinner /> : null}
      {rows && rows.length === 0 ? <Empty title="Nothing to bill yet" body="Add a product or a service such as stitching, repair, or a day’s labour." action={<Button onClick={startNew}>Add product</Button>} /> : null}
      {rows && rows.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((product) => (
            <article key={product.id} className="rounded-3xl border border-line bg-card p-4">
              <div className="mb-3 flex aspect-[4/3] items-center justify-center overflow-hidden rounded-2xl bg-paper">
                {product.images?.[0]?.url ? <img src={product.images[0].url} alt="" className="h-full w-full object-cover" /> : <img src="/logo.png" alt="" className="h-16 w-16 rounded-full object-cover" />}
              </div>
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  aria-label={`Include ${product.name}`}
                  checked={picked.includes(product.id)}
                  onChange={(event) => setPicked((current) => (event.target.checked ? [...current, product.id] : current.filter((id) => id !== product.id)))}
                />
                <div className="min-w-0 flex-1">
                  <Link to={`/products/${product.id}`} className="font-semibold">{product.name}</Link>
                  <p className="text-xs text-muted">{[product.sku, product.category, product.unit].filter(Boolean).join(' · ') || 'No SKU'}</p>
                  <p className="mt-1 text-sm">Retail {inr(product.sellingPrice)}</p>
                  <p className="text-sm">{product.wholesalePrice == null ? 'Wholesale not set' : `Wholesale ${inr(product.wholesalePrice)}`}</p>
                  <p className="text-xs text-muted">{product.trackStock ? `${product.stockQuantity ?? 0} ${product.unit} in stock` : 'Stock not tracked'} · GST {product.gstRate}%</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => startEdit(product)}>Edit</Button>
                <Button variant="ghost" onClick={() => void downloadCatalogFor(product, 'retail')}>Retail PDF</Button>
                <Button variant="ghost" disabled={product.wholesalePrice == null} onClick={() => void downloadCatalogFor(product, 'wholesale')}>Wholesale PDF</Button>
                <Button variant="ghost" onClick={() => void remove(product)}>Delete</Button>
              </div>
            </article>
          ))}
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
          <Field label="Sub-category">
            <TextInput value={draft.subCategory} onChange={(event) => setDraft({ ...draft, subCategory: event.target.value })} />
          </Field>
          <Field label="Brand">
            <TextInput value={draft.brand} onChange={(event) => setDraft({ ...draft, brand: event.target.value })} />
          </Field>
          <Field label="Retail price">
            <TextInput inputMode="decimal" value={draft.sellingPrice} onChange={(event) => setDraft({ ...draft, sellingPrice: event.target.value })} required />
          </Field>
          <Field label="Wholesale price">
            <TextInput inputMode="decimal" value={draft.wholesalePrice} onChange={(event) => setDraft({ ...draft, wholesalePrice: event.target.value })} />
          </Field>
          <Field label="Purchase price">
            <TextInput inputMode="decimal" value={draft.purchasePrice} onChange={(event) => setDraft({ ...draft, purchasePrice: event.target.value })} />
          </Field>
          <Field label="Status">
            <SelectInput value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as 'active' | 'inactive' })}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </SelectInput>
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
          <div className="sm:col-span-2">
            <Field label="Product image">
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setPhoto(event.target.files?.[0] || null)} />
            </Field>
            {photo ? <p className="mt-1 text-xs text-muted">{photo.name} will be saved with this product.</p> : null}
            {editing?.images?.length ? (
              <div className="mt-2 flex gap-2">
                {editing.images.map((image) => (
                  <img key={image.id} src={image.url} alt="" className="h-16 w-16 rounded-xl object-cover" />
                ))}
              </div>
            ) : null}
          </div>
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
