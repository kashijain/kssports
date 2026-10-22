import { Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAuth } from '../auth';
import { InvoiceActions } from '../components/InvoiceActions';
import { Badge, Button, Empty, PageHeader, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { inr, prettyDate } from '../lib/format';
import { fail } from '../lib/toast';

interface Dash {
  stats: {
    totalSales: number;
    todaySales: number;
    monthSales: number;
    totalInvoices: number;
    paidInvoices: number;
    pendingInvoices: number;
    outstanding: number;
    gstCollected: number;
  };
  chart: { date: string; total: number }[];
  recent: { id: string; number: string; invoiceDate: string; customerName: string; status: string; statusLabel: string; grandTotal: number }[];
  checklist: { business: boolean; customer: boolean; product: boolean; invoice: boolean } | null;
}

export function Dashboard() {
  const { business } = useAuth();
  const [data, setData] = useState<Dash | null>(null);
  const [error, setError] = useState('');

  function load() {
    setError('');
    api<Dash>('/api/reports/dashboard')
      .then(setData)
      .catch((err) => {
        setError('The dashboard could not be loaded.');
        fail(err);
      });
  }

  useEffect(() => {
    load();
  }, []);

  if (error) {
    return (
      <Empty
        title="Dashboard unavailable"
        body={error}
        action={
          <Button onClick={load} variant="secondary">
            Try again
          </Button>
        }
      />
    );
  }
  if (!data) return <Spinner />;

  const cards = [
    ['Total sales', data.stats.totalSales],
    ["Today's sales", data.stats.todaySales],
    ["This month's sales", data.stats.monthSales],
    ['Outstanding', data.stats.outstanding],
    ['GST collected', data.stats.gstCollected],
  ] as const;

  return (
    <div>
      <PageHeader
        title={business ? `Good day, ${business.name}` : 'Dashboard'}
        lede={business?.gstEnabled ? `GSTIN ${business.gstin}. Same-state bills split CGST and SGST. Other states use IGST.` : 'No GSTIN on file, so new bills stay non-GST.'}
        action={
          <Link to="/invoices/new">
            <Button>
              <Plus size={16} /> Create Invoice
            </Button>
          </Link>
        }
      />

      {data.checklist ? (
        <div className="mb-6 rounded-3xl border border-line bg-amber/60 p-5">
          <h2 className="font-serif text-2xl">First bill checklist</h2>
          <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <Check done={data.checklist.business} label="Shop profile saved" href="/settings" />
            <Check done={data.checklist.customer} label="Add a customer" href="/customers" />
            <Check done={data.checklist.product} label="Add a product or service" href="/products" />
            <Check done={data.checklist.invoice} label="Create the first invoice" href="/invoices/new" />
          </ul>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map(([label, value]) => (
          <article key={label} className="rounded-3xl border border-line bg-card p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
            <p className="mt-2 font-serif text-2xl tabular">{inr(value)}</p>
          </article>
        ))}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Count label="Issued invoices" value={data.stats.totalInvoices} />
        <Count label="Paid" value={data.stats.paidInvoices} />
        <Count label="Pending" value={data.stats.pendingInvoices} />
      </div>

      <section className="mt-6 rounded-3xl border border-line bg-card p-4">
        <h2 className="font-serif text-2xl">Sales, last 30 days</h2>
        <div className="mt-3 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.chart}>
              <XAxis dataKey="date" tickFormatter={(value) => prettyDate(String(value)).slice(0, 6)} minTickGap={24} />
              <YAxis tickFormatter={(value) => compact(Number(value))} width={56} />
              <Tooltip formatter={(value) => inr(Number(value))} labelFormatter={(label) => prettyDate(String(label))} />
              <Area type="monotone" dataKey="total" stroke="#c24d24" fill="#f4e6cf" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="mt-6">
        <h2 className="mb-3 font-serif text-2xl">Recent invoices</h2>
        {data.recent.length === 0 ? (
          <Empty title="No invoices yet" body="A counter bill usually takes a customer, an item, and one click." action={<Link to="/invoices/new"><Button>Create Invoice</Button></Link>} />
        ) : (
          <div className="overflow-x-auto rounded-3xl border border-line bg-card">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">Invoice</th>
                  <th>Customer</th>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th className="px-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.recent.map((row) => (
                  <tr key={row.id} className="border-t border-line">
                    <td className="px-4 py-3 font-semibold">
                      <Link to={`/invoices/${row.id}`}>{row.number}</Link>
                    </td>
                    <td>{row.customerName}</td>
                    <td>{prettyDate(row.invoiceDate)}</td>
                    <td className="tabular">{inr(row.grandTotal)}</td>
                    <td>
                      <Badge status={row.status} label={row.statusLabel} />
                    </td>
                    <td className="px-4 py-2">
                      <InvoiceActions id={row.id} number={row.number} status={row.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <article className="rounded-3xl border border-line bg-card px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="font-serif text-3xl">{value}</p>
    </article>
  );
}

function Check({ done, label, href }: { done: boolean; label: string; href: string }) {
  return (
    <li>
      <Link to={href} className="flex items-center gap-2 rounded-xl px-2 py-1 hover:bg-white/60">
        <span className={`grid h-5 w-5 place-items-center rounded-full text-xs ${done ? 'bg-teal text-white' : 'border border-line'}`}>{done ? '✓' : ''}</span>
        {label}
      </Link>
    </li>
  );
}

function compact(value: number) {
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(0)}k`;
  return `₹${value}`;
}
