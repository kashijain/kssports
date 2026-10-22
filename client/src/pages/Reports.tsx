import { useEffect, useState } from 'react';
import { Button, Empty, PageHeader, Spinner, TextInput } from '../components/ui';
import { downloadFile } from '../lib/api';
import { api } from '../lib/api';
import { inr, prettyDate } from '../lib/format';
import { fail } from '../lib/toast';

type PresetId = 'today' | 'week' | 'month' | 'quarter' | 'fy' | 'custom';
type Tab = 'sales' | 'products' | 'customers' | 'purchases' | 'inventory' | 'profit' | 'expenses' | 'gst' | 'payments' | 'outstanding';

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
    { id: 'products', label: 'Product sales' },
    { id: 'customers', label: 'Customer sales' },
    { id: 'purchases', label: 'Purchases' },
    { id: 'inventory', label: 'Inventory' },
    { id: 'profit', label: 'Profit' },
    { id: 'expenses', label: 'Expenses' },
    { id: 'gst', label: 'GST' },
    { id: 'payments', label: 'Collections' },
    { id: 'outstanding', label: 'Outstanding' },
  ];

  return (
    <div>
      <PageHeader title="Reports" lede="Sales are money in. Purchases are money out to suppliers. Expenses are operating costs. Inventory is what is on the shelf now." />
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
      {data && tab === 'purchases' ? <PurchaseTable data={data as unknown as PurchaseData} /> : null}
      {data && tab === 'inventory' ? <InventoryTable data={data as unknown as InventoryData} /> : null}
      {data && tab === 'profit' ? <ProfitCard data={data as unknown as ProfitData} /> : null}
      {data && tab === 'expenses' ? <ExpenseTable data={data as unknown as ExpenseData} /> : null}
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

interface PurchaseData { total: number; rows: { number: string; date: string; supplier: string; invoice: string; total: number; paid: number; due: number }[] }
interface InventoryData { method: string; total: number; rows: { name: string; sku: string; quantity: number; unit: string; rate: number | null; value: number | null; low: boolean }[] }
interface ProfitData { revenue: number; cost: number | null; grossProfit: number | null; expenses: number; netProfit: number | null; costUnavailable: boolean }
interface ExpenseData { total: number; rows: { date: string; name: string; category: string; vendor: string; method: string; amount: number }[] }

function moneyOrGap(value: number | null) {
  return value == null ? 'Cost unavailable' : inr(value);
}

function PurchaseTable({ data }: { data: PurchaseData }) {
  return (
    <ReportShell summary={`Purchases ${inr(data.total)}`}>
      <Table headers={['Purchase', 'Date', 'Supplier', 'Their invoice', 'Total', 'Paid', 'Due']} rows={data.rows.map((row) => [row.number, prettyDate(row.date), row.supplier, row.invoice || '—', inr(row.total), inr(row.paid), inr(row.due)])} />
    </ReportShell>
  );
}

function InventoryTable({ data }: { data: InventoryData }) {
  return (
    <ReportShell summary={`On-hand value ${inr(data.total)} · valued at ${data.method} price. Average uses the latest purchase price.`}>
      <Table headers={['Product', 'SKU', 'Qty', 'Rate', 'Value', 'Low']} rows={data.rows.map((row) => [row.name, row.sku || '—', `${row.quantity} ${row.unit}`, row.rate == null ? 'Cost unavailable' : inr(row.rate), row.value == null ? 'Cost unavailable' : inr(row.value), row.low ? 'Yes' : ''])} />
    </ReportShell>
  );
}

function ProfitCard({ data }: { data: ProfitData }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <article className="rounded-3xl border border-line bg-card p-4"><p className="text-xs uppercase text-muted">Revenue</p><p className="mt-2 font-serif text-2xl">{inr(data.revenue)}</p></article>
      <article className="rounded-3xl border border-line bg-card p-4"><p className="text-xs uppercase text-muted">Cost</p><p className="mt-2 font-serif text-2xl">{moneyOrGap(data.cost)}</p></article>
      <article className="rounded-3xl border border-line bg-card p-4"><p className="text-xs uppercase text-muted">Gross profit</p><p className="mt-2 font-serif text-2xl">{moneyOrGap(data.grossProfit)}</p></article>
      <article className="rounded-3xl border border-line bg-card p-4"><p className="text-xs uppercase text-muted">Expenses</p><p className="mt-2 font-serif text-2xl">{inr(data.expenses)}</p></article>
      <article className="rounded-3xl border border-line bg-card p-4"><p className="text-xs uppercase text-muted">Estimated net profit</p><p className="mt-2 font-serif text-2xl">{moneyOrGap(data.netProfit)}</p>{data.costUnavailable ? <p className="mt-1 text-xs text-muted">Some lines have no purchase cost and were left out.</p> : null}</article>
    </div>
  );
}

function ExpenseTable({ data }: { data: ExpenseData }) {
  return (
    <ReportShell summary={`Operating expenses ${inr(data.total)}`}>
      <Table headers={['Date', 'Name', 'Category', 'Vendor', 'Method', 'Amount']} rows={data.rows.map((row) => [prettyDate(row.date), row.name, row.category, row.vendor || '—', row.method, inr(row.amount)])} />
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
