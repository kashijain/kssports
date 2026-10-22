import { useEffect, useState } from 'react';
import { Empty, PageHeader, SelectInput, Spinner, TextInput } from '../components/ui';
import { api } from '../lib/api';
import { prettyDate } from '../lib/format';
import { fail } from '../lib/toast';

interface Doc {
  id: string;
  name: string;
  module: string;
  recordId: string;
  size: number;
  fileType: string;
  uploadedAt: string;
}

export function DocumentsPage() {
  const [rows, setRows] = useState<Doc[] | null>(null);
  const [q, setQ] = useState('');
  const [moduleName, setModuleName] = useState('');
  const [fileType, setFileType] = useState('');
  const [invoice, setInvoice] = useState('');
  const [supplier, setSupplier] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  function load() {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (moduleName) params.set('module', moduleName);
    if (fileType) params.set('fileType', fileType);
    if (invoice) params.set('invoice', invoice);
    if (supplier) params.set('supplier', supplier);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    api<{ documents: Doc[] }>(`/api/documents?${params}`)
      .then((data) => setRows(data.documents))
      .catch(fail);
  }

  useEffect(() => {
    const handle = window.setTimeout(load, 200);
    return () => window.clearTimeout(handle);
  }, [q, moduleName, fileType, invoice, supplier, from, to]);

  return (
    <div>
      <PageHeader title="Documents" lede="Supplier bills and files stay attached to the purchase, machine, expense, or product they belong to. Nothing is stored twice." />
      <div className="mb-4 grid gap-2 md:grid-cols-3 xl:grid-cols-7">
        <TextInput placeholder="File name" value={q} onChange={(event) => setQ(event.target.value)} />
        <SelectInput value={moduleName} onChange={(event) => setModuleName(event.target.value)}>
          <option value="">All records</option>
          <option value="purchase">Purchases</option>
          <option value="machine">Machines</option>
          <option value="expense">Expenses</option>
          <option value="product">Products</option>
          <option value="customer">Customers</option>
        </SelectInput>
        <SelectInput value={fileType} onChange={(event) => setFileType(event.target.value)}>
          <option value="">Any file</option>
          <option value="pdf">PDF</option>
          <option value="image">Image</option>
        </SelectInput>
        <TextInput placeholder="Supplier invoice" value={invoice} onChange={(event) => setInvoice(event.target.value)} />
        <TextInput placeholder="Supplier" value={supplier} onChange={(event) => setSupplier(event.target.value)} />
        <TextInput type="date" aria-label="From" value={from} onChange={(event) => setFrom(event.target.value)} />
        <TextInput type="date" aria-label="To" value={to} onChange={(event) => setTo(event.target.value)} />
      </div>
      {!rows ? <Spinner /> : null}
      {rows && rows.length === 0 ? <Empty title="No documents yet" body="Upload a supplier bill from a wholesale purchase and it will appear here." /> : null}
      {rows && rows.length > 0 ? (
        <div className="overflow-x-auto rounded-3xl border border-line bg-card">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="text-xs uppercase text-muted"><tr><th className="px-4 py-3">Name</th><th>Type</th><th>Linked to</th><th>Uploaded</th><th>Size</th><th /></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-line">
                  <td className="px-4 py-3 font-semibold">{row.name}</td>
                  <td>{row.fileType}</td>
                  <td className="capitalize">{row.module}</td>
                  <td>{prettyDate(row.uploadedAt?.slice(0, 10))}</td>
                  <td>{(row.size / 1024).toFixed(0)} KB</td>
                  <td className="space-x-3">
                    <a href={`/api/documents/${row.id}/file`} target="_blank" rel="noreferrer">Preview</a>
                    <a href={`/api/documents/${row.id}/file?download=1`}>Download</a>
                    <button type="button" className="text-clay-dark" onClick={() => { if (window.confirm('Delete this file?')) void api(`/api/documents/${row.id}`, { method: 'DELETE' }).then(load).catch(fail); }}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
