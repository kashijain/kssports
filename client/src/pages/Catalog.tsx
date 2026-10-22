import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Dialog, Empty, PageHeader, SelectInput, Spinner, TextInput } from '../components/ui';
import { api, downloadFile } from '../lib/api';
import { inr } from '../lib/format';
import { fail } from '../lib/toast';
import type { Product } from '../types';

export function Catalog() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [category, setCategory] = useState('');
  const [brand, setBrand] = useState('');
  const [q, setQ] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [activeOnly, setActiveOnly] = useState(true);
  const [wholesaleOnly, setWholesaleOnly] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ products: Product[] }>('/api/products?limit=100')
      .then((data) => setProducts(data.products))
      .catch(fail);
  }, []);

  const categories = useMemo(() => [...new Set((products || []).map((item) => item.category).filter(Boolean))], [products]);
  const brands = useMemo(() => [...new Set((products || []).map((item) => item.brand).filter(Boolean))], [products]);
  const visible = (products || []).filter((item) => {
    if (activeOnly && item.status === 'inactive') return false;
    if (category && item.category !== category) return false;
    if (brand && item.brand !== brand) return false;
    if (q && !`${item.name} ${item.sku}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (minPrice && item.sellingPrice < Number(minPrice)) return false;
    if (maxPrice && item.sellingPrice > Number(maxPrice)) return false;
    if (wholesaleOnly && item.wholesalePrice == null) return false;
    return true;
  });

  function queryString() {
    const params = new URLSearchParams();
    const ids = picked.length ? picked : visible.map((item) => item.id);
    if (ids.length) params.set('ids', ids.join(','));
    if (category) params.set('category', category);
    if (brand) params.set('brand', brand);
    if (minPrice) params.set('minPrice', minPrice);
    if (maxPrice) params.set('maxPrice', maxPrice);
    if (wholesaleOnly) params.set('wholesaleOnly', '1');
    if (!activeOnly) params.set('activeOnly', '0');
    return params.toString();
  }

  async function openPreview() {
    setBusy(true);
    try {
      const response = await fetch('/api/catalog/preview', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: (picked.length ? picked : visible.map((item) => item.id)).join(','),
          category,
          brand,
          minPrice,
          maxPrice,
          wholesaleOnly,
          activeOnly,
        }),
      });
      setPreview(await response.text());
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }

  if (!products) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="Product catalog"
        lede="Choose the products buyers should see, then preview, print, or download the KS Sports catalog."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={busy} onClick={() => void openPreview()}>Preview catalog</Button>
            <Button variant="secondary" onClick={() => window.open(`/api/catalog/html?print=1&${queryString()}`, '_blank', 'noopener')}>Print catalog</Button>
            <Button disabled={busy} onClick={() => void downloadFile(`/api/catalog/pdf?${queryString()}`, 'ks-sports-catalog.pdf').catch(fail)}>Generate catalog PDF</Button>
          </div>
        }
      />
      <div className="mb-4 grid gap-2 md:grid-cols-4">
        <TextInput placeholder="Product name or SKU" value={q} onChange={(event) => setQ(event.target.value)} />
        <SelectInput value={category} onChange={(event) => setCategory(event.target.value)}>
          <option value="">All categories</option>
          {categories.map((item) => <option key={item}>{item}</option>)}
        </SelectInput>
        <SelectInput value={brand} onChange={(event) => setBrand(event.target.value)}>
          <option value="">All brands</option>
          {brands.map((item) => <option key={item}>{item}</option>)}
        </SelectInput>
        <div className="flex gap-2">
          <TextInput placeholder="Min ₹" value={minPrice} onChange={(event) => setMinPrice(event.target.value)} />
          <TextInput placeholder="Max ₹" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} />
        </div>
      </div>
      <div className="mb-3 flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={activeOnly} onChange={(event) => setActiveOnly(event.target.checked)} /> Active products</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={wholesaleOnly} onChange={(event) => setWholesaleOnly(event.target.checked)} /> Wholesale price set</label>
        <button type="button" className="font-semibold" onClick={() => setPicked(visible.map((item) => item.id))}>Select all</button>
        <button type="button" className="text-muted" onClick={() => setPicked([])}>Clear</button>
      </div>
      {visible.length === 0 ? <Empty title="No products in this filter" body="Add products, or widen the category and price filters." /> : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((product) => (
          <label key={product.id} className="rounded-3xl border border-line bg-card p-4">
            <div className="mb-3 flex aspect-[4/3] items-center justify-center overflow-hidden rounded-2xl bg-paper">
              {product.images?.[0]?.url ? <img src={product.images[0].url} alt="" className="h-full w-full object-cover" /> : <img src="/logo.png" alt="" className="h-16 w-16 rounded-full object-cover" />}
            </div>
            <div className="flex items-start gap-2">
              <input type="checkbox" checked={picked.includes(product.id)} onChange={(event) => setPicked((current) => event.target.checked ? [...current, product.id] : current.filter((id) => id !== product.id))} />
              <div>
                <Link to={`/products/${product.id}`} className="font-semibold">{product.name}</Link>
                <p className="text-xs text-muted">{product.sku || 'No SKU'} · {product.category || 'Uncategorised'} · {product.brand || 'No brand'}</p>
                <p className="mt-1 text-sm">Retail {inr(product.sellingPrice)}{product.wholesalePrice != null ? ` · Wholesale ${inr(product.wholesalePrice)}` : ''}</p>
              </div>
            </div>
          </label>
        ))}
      </div>
      <Dialog open={Boolean(preview)} title="Catalog preview" onClose={() => setPreview('')} wide>
        <iframe title="Catalog preview" className="h-[70vh] w-full rounded-xl border border-line bg-white" srcDoc={preview} />
      </Dialog>
    </div>
  );
}
