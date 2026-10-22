import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Button, Empty, Field, PageHeader, Spinner, TextInput } from '../components/ui';
import { api, downloadFile } from '../lib/api';
import { inr, prettyDate } from '../lib/format';
import { fail } from '../lib/toast';
import type { Product } from '../types';

interface Activity {
  sales: { id: string; number: string; date: string; customer: string; quantity: number; total: number; status: string }[];
  purchases: { id: string; number: string; date: string; supplier: string; quantity: number; total: number }[];
  movements: { id: string; date: string; type: string; reference: string; qtyIn: number; qtyOut: number; balance: number }[];
}

export function ProductDetail() {
  const { id = '' } = useParams();
  const [product, setProduct] = useState<Product | null>(null);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [qty, setQty] = useState('1');
  const [photo, setPhoto] = useState(0);

  function load() {
    Promise.all([
      api<{ product: Product }>(`/api/products/${id}`),
      api<Activity>(`/api/products/${id}/activity`),
    ])
      .then(([item, history]) => {
        setProduct(item.product);
        setActivity(history);
      })
      .catch(fail);
  }

  useEffect(() => {
    load();
  }, [id]);

  async function addStock(event: React.FormEvent) {
    event.preventDefault();
    try {
      const data = await api<{ product: Product }>(`/api/products/${id}/stock`, { method: 'POST', body: JSON.stringify({ quantity: Number(qty) }) });
      setProduct(data.product);
      toast.success('Stock added.');
      load();
    } catch (error) {
      fail(error);
    }
  }

  async function upload(file: File) {
    const body = new FormData();
    body.append('file', file);
    try {
      const data = await api<{ product: Product }>(`/api/products/${id}/images`, { method: 'POST', body });
      setProduct(data.product);
    } catch (error) {
      fail(error);
    }
  }

  if (!product) return <Spinner />;
  const image = product.images?.[photo];

  return (
    <div>
      <PageHeader
        title={product.name}
        lede={[product.sku, product.category, product.brand].filter(Boolean).join(' · ') || 'Product'}
        action={
          <div className="flex flex-wrap gap-2">
            <Link to="/products"><Button variant="secondary">Edit in products</Button></Link>
            <Link to={`/invoices/new?product=${product.id}`}><Button>Create sale</Button></Link>
            <Button variant="secondary" onClick={() => void downloadFile(`/api/catalog/pdf?ids=${product.id}`, `${product.sku || 'product'}.pdf`).catch(fail)}>Download catalog entry</Button>
          </div>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-3xl border border-line bg-card p-4">
          <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-2xl bg-paper">
            {image?.url ? <img src={image.url} alt={image.alt} className="h-full w-full object-contain" /> : <img src="/mark.svg" alt="KS Sports" className="h-24 w-24" />}
          </div>
          <div className="mt-3 flex gap-2">
            {(product.images || []).map((item, index) => (
              <button key={item.id} type="button" onClick={() => setPhoto(index)} className="h-14 w-14 overflow-hidden rounded-xl border border-line">
                <img src={item.url} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
            <label className="grid h-14 w-14 cursor-pointer place-items-center rounded-xl border border-dashed border-line text-xs">
              Add
              <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} />
            </label>
          </div>
          <p className="mt-4 text-sm">{product.description || 'No description yet.'}</p>
          <h2 className="mt-4 font-serif text-2xl">Specifications</h2>
          {(product.specifications || []).length === 0 ? <p className="text-sm text-muted">None yet.</p> : null}
          <ul className="mt-2 text-sm">
            {(product.specifications || []).map((row) => (
              <li key={row.label} className="flex justify-between border-t border-line py-2"><span>{row.label}</span><span>{row.value}</span></li>
            ))}
          </ul>
        </div>
        <aside className="grid gap-3">
          <section className="rounded-3xl border border-line bg-card p-4 text-sm">
            <Price label="Purchase price" value={product.purchasePrice == null ? 'Cost unavailable' : inr(product.purchasePrice)} />
            <Price label="Wholesale price" value={product.wholesalePrice == null ? '—' : inr(product.wholesalePrice)} />
            <Price label="Retail price" value={inr(product.sellingPrice)} />
            <Price label="Current stock" value={product.trackStock ? `${product.stockQuantity} ${product.unit}` : 'Not tracked'} />
            <Price label="GST" value={`${product.gstRate}%`} />
            <Price label="HSN/SAC" value={product.hsnSac || '—'} />
            <Price label="Status" value={product.status === 'inactive' ? 'Inactive' : 'Active'} />
          </section>
          <form onSubmit={addStock} className="rounded-3xl border border-line bg-card p-4">
            <Field label="Add stock">
              <TextInput value={qty} onChange={(event) => setQty(event.target.value)} inputMode="decimal" />
            </Field>
            <Button className="mt-2" type="submit">Add stock</Button>
          </form>
        </aside>
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <History title="Sales history" empty="No sales yet" rows={(activity?.sales || []).map((row) => ({ href: `/invoices/${row.id}`, title: row.number, detail: `${prettyDate(row.date)} · ${row.customer} · ${row.quantity}` }))} />
        <History title="Purchase history" empty="No purchases yet" rows={(activity?.purchases || []).map((row) => ({ href: '/purchases', title: row.number, detail: `${prettyDate(row.date)} · ${row.supplier} · ${row.quantity}` }))} />
        <section className="rounded-3xl border border-line bg-card p-4">
          <h2 className="font-serif text-2xl">Stock movement</h2>
          {(activity?.movements || []).length === 0 ? <p className="mt-2 text-sm text-muted">No movements yet.</p> : null}
          <table className="mt-2 w-full text-left text-xs">
            <thead><tr className="text-muted"><th>Date</th><th>Type</th><th>Ref</th><th>In</th><th>Out</th><th>Bal</th></tr></thead>
            <tbody>
              {(activity?.movements || []).map((row) => (
                <tr key={row.id} className="border-t border-line">
                  <td>{prettyDate(row.date)}</td><td>{row.type}</td><td>{row.reference}</td><td>{row.qtyIn}</td><td>{row.qtyOut}</td><td>{row.balance}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}

function Price({ label, value }: { label: string; value: string }) {
  return <p className="flex justify-between py-1"><span className="text-muted">{label}</span><span className="font-semibold">{value}</span></p>;
}

function History({ title, rows, empty }: { title: string; rows: { href: string; title: string; detail: string }[]; empty: string }) {
  return (
    <section className="rounded-3xl border border-line bg-card p-4">
      <h2 className="font-serif text-2xl">{title}</h2>
      {rows.length === 0 ? <Empty title={empty} body="" /> : null}
      <ul className="mt-2 text-sm">
        {rows.map((row) => (
          <li key={row.title + row.detail} className="border-t border-line py-2">
            <Link to={row.href} className="font-semibold">{row.title}</Link>
            <p className="text-muted">{row.detail}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
