import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { DocumentFileLink } from '../components/DocumentFileLink';
import { StateSelect } from '../components/StateSelect';
import { Badge, Button, Dialog, Empty, Field, PageHeader, SelectInput, Spinner, TextInput } from '../components/ui';
import { api, downloadFile } from '../lib/api';
import { inr, prettyDate } from '../lib/format';
import { fail } from '../lib/toast';
import type { Product, TaxRate } from '../types';

interface Supplier { id: string; name: string; company: string; stateCode: string; gstin: string }
interface Doc { id: string; name: string; size: number; uploadedAt: string; fileType: string }
interface Purchase {
  id: string;
  number: string;
  supplierInvoice: string;
  purchaseDate: string;
  status: string;
  supplier: { name?: string; company?: string };
  totals: { grandTotal?: number };
  amountPaid: number;
  amountDue: number;
  documents?: Doc[];
}

export function Purchases() {
  const [rows, setRows] = useState<Purchase[] | null>(null);
  const [rates, setRates] = useState<TaxRate[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Purchase | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [busy, setBusy] = useState(false);
  const [supplier, setSupplier] = useState({ name: '', company: '', mobile: '', email: '', addressLine1: '', city: '', stateCode: '', pincode: '', gstin: '' });
  const [invoiceNo, setInvoiceNo] = useState('');
  const [date, setDate] = useState('');
  const [productId, setProductId] = useState('');
  const [qty, setQty] = useState('1');
  const [price, setPrice] = useState('');
  const [gst, setGst] = useState('18');
  const [billFile, setBillFile] = useState<File | null>(null);

  function load() {
    api<{ purchases: Purchase[] }>('/api/purchases')
      .then((data) => setRows(data.purchases))
      .catch(fail);
  }

  useEffect(() => {
    load();
    api<{ products: Product[] }>('/api/products?limit=100').then((data) => setProducts(data.products)).catch(() => undefined);
    api<{ suppliers: Supplier[] }>('/api/suppliers').then((data) => setSuppliers(data.suppliers)).catch(() => undefined);
    api<{ taxRates: TaxRate[] }>('/api/tax-rates').then((data) => setRates(data.taxRates.filter((rate) => rate.active))).catch(() => undefined);
  }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const product = products.find((item) => item.id === productId);
    setBusy(true);
    try {
      const created = await api<{ purchase: Purchase }>('/api/purchases', {
        method: 'POST',
        body: JSON.stringify({
          supplier,
          supplierInvoice: invoiceNo,
          purchaseDate: date,
          status: 'unpaid',
          paymentMethod: 'bank_transfer',
          items: [{
            productId: productId || null,
            name: product?.name || supplier.name,
            sku: product?.sku || '',
            quantity: Number(qty),
            purchasePrice: Number(price),
            gstRate: Number(gst),
          }],
        }),
      });
      if (billFile) {
        try {
          await attachBill(created.purchase.id, billFile);
          toast.success('Purchase saved and the supplier bill is attached.');
        } catch (error) {
          toast.success('Purchase saved.');
          fail(error);
        }
      } else {
        toast.success('Purchase saved. Stock has been increased.');
      }
      setBillFile(null);
      setOpen(false);
      load();
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }

  async function openPurchase(row: Purchase) {
    const data = await api<{ purchase: Purchase; documents: Doc[] }>(`/api/purchases/${row.id}`);
    setSelected(data.purchase);
    setDocs(data.documents);
  }

  async function attachBill(purchaseId: string, file: File, replaceId?: string) {
    const body = new FormData();
    body.append('file', file);
    if (replaceId) body.append('replaceId', replaceId);
    await api(`/api/purchases/${purchaseId}/bill`, { method: 'POST', body });
  }

  async function downloadList(format: 'csv' | 'pdf' | 'bills') {
    try {
      const filename = format === 'bills' ? 'ks-sports-purchase-bills.pdf' : `ks-sports-wholesale-purchases.${format}`;
      await downloadFile(`/api/purchases/download?format=${format}`, filename);
    } catch (error) {
      fail(error);
    }
  }

  async function downloadBill(row: Purchase) {
    try {
      await downloadFile(`/api/purchases/${row.id}/pdf`, `${row.number}.pdf`);
    } catch (error) {
      fail(error);
    }
  }

  async function uploadBill(purchaseId: string, file: File, replaceId?: string) {
    try {
      await attachBill(purchaseId, file, replaceId);
      toast.success('Supplier bill attached.');
      load();
      if (selected?.id === purchaseId) await openPurchase(selected);
    } catch (error) {
      fail(error);
    }
  }

  return (
    <div>
      <PageHeader
        title="Wholesale purchases"
        lede="Money going out to suppliers. Save the purchase, then keep the bill you received from them on the same record."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void downloadList('csv')}>Download CSV</Button>
            <Button variant="secondary" onClick={() => void downloadList('pdf')}>Download PDF</Button>
            <Button variant="secondary" onClick={() => void downloadList('bills')}>Download bills</Button>
            <Button onClick={() => setOpen(true)}>New purchase</Button>
          </div>
        }
      />
      <p className="mb-4 max-w-3xl text-sm text-muted">
        Total profit is not this purchase total. It is counted when the goods are sold: the taxable sale amount minus the purchase cost saved on that bill. Shop expenses are subtracted after that. The Profit report shows the total.
      </p>
      {!rows ? <Spinner /> : null}
      {rows && rows.length === 0 ? <Empty title="No purchases yet" body="Record a supplier invoice when stock arrives." action={<Button onClick={() => setOpen(true)}>New purchase</Button>} /> : null}
      {rows && rows.length > 0 ? (
        <div className="overflow-x-auto rounded-3xl border border-line bg-card">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs uppercase text-muted"><tr><th className="px-4 py-3">Purchase</th><th>Supplier</th><th>Their invoice</th><th>Date</th><th>Total</th><th>Due</th><th>Their bill</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="cursor-pointer border-t border-line" onClick={() => void openPurchase(row)}>
                  <td className="px-4 py-3 font-semibold">{row.number}</td>
                  <td>{row.supplier?.name}</td>
                  <td>{row.supplierInvoice}</td>
                  <td>{prettyDate(row.purchaseDate)}</td>
                  <td>{inr(row.totals?.grandTotal)}</td>
                  <td>{inr(row.amountDue)}</td>
                  <td onClick={(event) => event.stopPropagation()}>
                    <span className="flex flex-wrap gap-3">
                      <button type="button" className="font-semibold" onClick={() => void downloadBill(row)}>Download</button>
                      {row.documents?.[0] ? (
                        <DocumentFileLink id={row.documents[0].id} name={row.documents[0].name} mode="download" className="font-semibold">Their file</DocumentFileLink>
                      ) : (
                        <label className="cursor-pointer font-semibold text-clay-dark">
                          Upload bill
                          <input type="file" accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadBill(row.id, file); event.target.value = ''; }} />
                        </label>
                      )}
                    </span>
                  </td>
                  <td><Badge status={row.status} label={row.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {selected ? (
        <section className="mt-4 rounded-3xl border border-line bg-card p-4">
          <h2 className="font-serif text-2xl">{selected.supplier?.company || selected.supplier?.name}</h2>
          <p className="text-sm text-muted">{selected.number} · Invoice {selected.supplierInvoice} · {prettyDate(selected.purchaseDate)} · {inr(selected.totals?.grandTotal)}</p>
          <h3 className="mt-4 font-semibold">Attached supplier bill</h3>
          {docs.length === 0 ? <p className="text-sm text-muted">No file yet.</p> : null}
          {docs.map((doc) => (
            <div key={doc.id} className="mt-2 flex flex-wrap items-center gap-3 text-sm">
              <span>{doc.name}</span>
              <span className="text-muted">{doc.fileType} · {(doc.size / 1024).toFixed(0)} KB</span>
              <DocumentFileLink id={doc.id} name={doc.name} mode="view" className="inline font-semibold">View</DocumentFileLink>
              <DocumentFileLink id={doc.id} name={doc.name} mode="download" className="inline font-semibold">Download</DocumentFileLink>
              <label className="cursor-pointer font-semibold">
                Replace
                <input type="file" accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadBill(selected.id, file, doc.id); event.target.value = ''; }} />
              </label>
              <button type="button" className="text-clay-dark" onClick={() => void api(`/api/documents/${doc.id}`, { method: 'DELETE' }).then(() => openPurchase(selected)).catch(fail)}>Delete</button>
            </div>
          ))}
          <label className="mt-3 inline-flex cursor-pointer rounded-full bg-clay px-4 py-2 text-sm font-semibold text-white">
            Upload supplier bill
            <input type="file" accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadBill(selected.id, file); event.target.value = ''; }} />
          </label>
        </section>
      ) : null}

      <Dialog open={open} title="New wholesale purchase" onClose={() => setOpen(false)} wide>
        <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
          <Field label="Supplier name"><TextInput value={supplier.name} onChange={(event) => setSupplier({ ...supplier, name: event.target.value })} required /></Field>
          <Field label="Company"><TextInput value={supplier.company} onChange={(event) => setSupplier({ ...supplier, company: event.target.value })} /></Field>
          <Field label="Mobile"><TextInput value={supplier.mobile} onChange={(event) => setSupplier({ ...supplier, mobile: event.target.value })} /></Field>
          <Field label="Email"><TextInput value={supplier.email} onChange={(event) => setSupplier({ ...supplier, email: event.target.value })} /></Field>
          <Field label="Address"><TextInput value={supplier.addressLine1} onChange={(event) => setSupplier({ ...supplier, addressLine1: event.target.value })} /></Field>
          <Field label="City"><TextInput value={supplier.city} onChange={(event) => setSupplier({ ...supplier, city: event.target.value })} /></Field>
          <Field label="State"><StateSelect value={supplier.stateCode} onChange={(code) => setSupplier({ ...supplier, stateCode: code })} /></Field>
          <Field label="GSTIN"><TextInput value={supplier.gstin} onChange={(event) => setSupplier({ ...supplier, gstin: event.target.value.toUpperCase() })} /></Field>
          {suppliers.length ? <p className="text-xs text-muted sm:col-span-2">Saved suppliers: {suppliers.map((item) => item.name).join(', ')}</p> : null}
          <Field label="Supplier invoice number"><TextInput value={invoiceNo} onChange={(event) => setInvoiceNo(event.target.value)} required /></Field>
          <Field label="Supplier's bill">
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-line px-3 py-2">
              <span className="truncate text-sm">{billFile ? billFile.name : 'PDF or photo of the bill you received'}</span>
              <span className="shrink-0 text-sm font-semibold text-clay-dark">{billFile ? 'Change' : 'Choose file'}</span>
              <input type="file" accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" className="hidden" onChange={(event) => setBillFile(event.target.files?.[0] || null)} />
            </label>
          </Field>
          <Field label="Purchase date"><TextInput type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></Field>
          <Field label="Product">
            <SelectInput value={productId} onChange={(event) => {
              const next = event.target.value;
              setProductId(next);
              const product = products.find((item) => item.id === next);
              if (product) {
                setPrice(String(product.purchasePrice ?? product.sellingPrice));
                setGst(String(product.gstRate));
                if (!supplier.name) setSupplier((current) => current);
              }
            }}>
              <option value="">Custom line</option>
              {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
            </SelectInput>
          </Field>
          <Field label="Quantity"><TextInput value={qty} onChange={(event) => setQty(event.target.value)} /></Field>
          <Field label="Purchase price"><TextInput value={price} onChange={(event) => setPrice(event.target.value)} required /></Field>
          <Field label="GST %">
            <SelectInput value={gst} onChange={(event) => setGst(event.target.value)}>
              {(rates.length ? rates : [{ id: 'zero', name: 'GST 0%', rate: 0, active: true }]).map((rate) => (
                <option key={rate.id} value={rate.rate}>{rate.name} ({rate.rate}%)</option>
              ))}
              {rates.some((rate) => String(rate.rate) === gst) || gst === '' ? null : <option value={gst}>{gst}%</option>}
            </SelectInput>
          </Field>
          <div className="sm:col-span-2"><Button type="submit" disabled={busy}>Save purchase</Button></div>
        </form>
      </Dialog>
    </div>
  );
}
