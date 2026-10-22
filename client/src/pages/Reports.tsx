import { useEffect, useState } from 'react';
import { Button, Empty, PageHeader, Spinner, TextInput } from '../components/ui';
import { downloadFile } from '../lib/api';
import { api } from '../lib/api';
import { inr, prettyDate } from '../lib/format';
import { fail } from '../lib/toast';

type PresetId = 'today' | 'week' | 'month' | 'quarter' | 'fy' | 'custom';
type Tab = 'sales' | 'gst' | 'customers' | 'products' | 'payments' | 'outstanding';

interface Presets {
  today: string;
  ranges: Record<Exclude<PresetId, 'custom'>, { from: string; to: string; label: string }>;
}

export function Reports() {
  const [presets, setPresets] = useState<Presets | null>(null);
  const [preset, setPreset] = useState<PresetId>('month');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [tab, setTab] = useState<Tab>('sales');
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<Presets>('/api/reports/presets')
      .then((result) => {
        setPresets(result);
        setFrom(result.ranges.month.from);
        setTo(result.ranges.month.to);
      })
      .catch(fail);
  }, []);

  useEffect(() => {
    if (!from || !to) return;
    setData(null);
    setError('');
    api<Record<string, unknown>>(`/api/reports/${tab}?from=${from}&to=${to}`)
      .then(setData)
      .catch((err) => {
        setError('This report could not be loaded.');
        fail(err);
      });
  }, [tab, from, to]);

  function choose(id: Exclude<PresetId, 'custom'>) {
    if (!presets) return;
    setPreset(id);
    setFrom(presets.ranges[id].from);
    setTo(presets.ranges[id].to);
  }

  async function exportReport(format: 'csv' | 'pdf') {
    try {
      await downloadFile(`/api/reports/${tab}?from=${from}&to=${to}&export=${format}`, `${tab}.${format}`);
    } catch (err) {
      fail(err);
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'sales', label: 'Sales' },
    { id: 'gst', label: 'GST' },
    { id: 'customers', label: 'Customers' },
    { id: 'products', label: 'Products' },
    { id: 'payments', label: 'Collections' },
    { id: 'outstanding', label: 'Outstanding' },
  ];

  return (
    <div>
      <PageHeader title="Reports" lede="Issued invoices only. Drafts and cancelled bills are left out. Dates follow your shop timezone." />
      <div className="mb-4 flex flex-wrap gap-2">
        {(presets ? (Object.keys(presets.ranges) as Exclude<PresetId, 'custom'>[]) : []).map((id) => (
          <Button key={id} variant={preset === id ? 'primary' : 'secondary'} onClick={() => choose(id)}>
            {presets?.ranges[id].label}
          </Button>
        ))}
        <Button variant={preset === 'custom' ? 'primary' : 'secondary'} onClick={() => setPreset('custom')}>
          Custom
        </Button>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <TextInput type="date" value={from} onChange={(event) => { setPreset('custom'); setFrom(event.target.value); }} aria-label="From" />
        <TextInput type="date" value={to} onChange={(event) => { setPreset('custom'); setTo(event.target.value); }} aria-label="To" />
        <Button variant="secondary" onClick={() => void exportReport('csv')}>
          CSV
        </Button>
        <Button variant="secondary" onClick={() => void exportReport('pdf')}>
          PDF
        </Button>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((item) => (
          <button key={item.id} type="button" className={`rounded-full px-3 py-1 text-sm ${tab === item.id ? 'bg-ink text-white' : 'bg-card'}`} onClick={() => setTab(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
      {error ? <Empty title="Report unavailable" body={error} /> : null}
      {!data && !error ? <Spinner /> : null}
      {data && tab === 'sales' ? <SalesTable data={data as unknown as SalesData} /> : null}
      {data && tab === 'gst' ? <GstTable data={data as unknown as GstData} /> : null}
      {data && tab === 'customers' ? <CustomerTable rows={(data.rows as CustomerRow[]) || []} /> : null}
      {data && tab === 'products' ? <ProductTable rows={(data.rows as ProductRow[]) || []} /> : null}
      {data && tab === 'payments' ? <PaymentTable data={data as unknown as PaymentData} /> : null}
      {data && tab === 'outstanding' ? <OutstandingTable data={data as unknown as OutstandingData} /> : null}
    </div>
  );
}

interface SalesData {
  total: number;
  tax: number;
  count: number;
  rows: { number: string; date: string; customer: string; status: string; taxable: number; tax: number; total: number; paid: number; due: number }[];
}
interface GstData {
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  rows: { hsnSac: string; gstRate: number; taxable: number; cgst: number; sgst: number; igst: number }[];
}
interface CustomerRow { customer: string; invoices: number; total: number; due: number }
interface ProductRow { name: string; hsnSac: string; unit: string; quantity: number; taxable: number; total: number }
interface PaymentData { total: number; rows: { date: string; invoice: string; customer: string; method: string; reference: string; amount: number }[] }
interface OutstandingData { total: number; rows: { number: string; date: string; dueDate: string; customer: string; status: string; total: number; paid: number; due: number }[] }

function SalesTable({ data }: { data: SalesData }) {
  return (
    <ReportShell summary={` ${data.count} invoices · ${inr(data.total)} · tax ${inr(data.tax)}`}>
      <Table
        headers={['Invoice', 'Date', 'Customer', 'Status', 'Taxable', 'Tax', 'Total', 'Due']}
        rows={data.rows.map((row) => [row.number, prettyDate(row.date), row.customer, row.status, inr(row.taxable), inr(row.tax), inr(row.total), inr(row.due)])}
      />
    </ReportShell>
  );
}

function GstTable({ data }: { data: GstData }) {
  return (
    <ReportShell summary={`Taxable ${inr(data.taxable)} · CGST ${inr(data.cgst)} · SGST ${inr(data.sgst)} · IGST ${inr(data.igst)}`}>
      <p className="mb-3 text-xs text-muted">Grouped by the HSN/SAC and rate stored on each invoice. This is a working summary, not a filed return.</p>
      <Table headers={['HSN/SAC', 'Rate', 'Taxable', 'CGST', 'SGST', 'IGST']} rows={data.rows.map((row) => [row.hsnSac || '—', `${row.gstRate}%`, inr(row.taxable), inr(row.cgst), inr(row.sgst), inr(row.igst)])} />
    </ReportShell>
  );
}

function CustomerTable({ rows }: { rows: CustomerRow[] }) {
  return <Table headers={['Customer', 'Invoices', 'Sales', 'Due']} rows={rows.map((row) => [row.customer, String(row.invoices), inr(row.total), inr(row.due)])} />;
}

function ProductTable({ rows }: { rows: ProductRow[] }) {
  return <Table headers={['Item', 'HSN/SAC', 'Qty', 'Taxable', 'Total']} rows={rows.map((row) => [row.name, row.hsnSac || '—', `${row.quantity} ${row.unit}`, inr(row.taxable), inr(row.total)])} />;
}

function PaymentTable({ data }: { data: PaymentData }) {
  return (
    <ReportShell summary={`Collected ${inr(data.total)}`}>
      <Table headers={['Date', 'Invoice', 'Customer', 'Method', 'Reference', 'Amount']} rows={data.rows.map((row) => [prettyDate(row.date), row.invoice, row.customer, row.method, row.reference || '—', inr(row.amount)])} />
    </ReportShell>
  );
}

function OutstandingTable({ data }: { data: OutstandingData }) {
  return (
    <ReportShell summary={`Still to collect ${inr(data.total)}`}>
      <Table headers={['Invoice', 'Date', 'Due', 'Customer', 'Status', 'Balance']} rows={data.rows.map((row) => [row.number, prettyDate(row.date), prettyDate(row.dueDate), row.customer, row.status, inr(row.due)])} />
    </ReportShell>
  );
}

function ReportShell({ summary, children }: { summary: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-3 text-sm font-medium">{summary}</p>
      {children}
    </div>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  if (!rows.length) return <Empty title="Nothing in this period" body="Try a wider range, or issue an invoice first." />;
  return (
    <div className="overflow-x-auto rounded-3xl border border-line bg-card">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-muted">
          <tr>
            {headers.map((header) => (
              <th key={header} className="px-4 py-3">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-t border-line">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-4 py-2">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
