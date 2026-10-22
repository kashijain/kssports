import { Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Area, AreaChart, Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
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
    todayPurchases: number;
    monthPurchases: number;
    supplierOutstanding: number;
    productCount: number;
    stockUnits: number;
    lowStock: number;
    outOfStock: number;
    receivables: number;
    payables: number;
    expenses: number;
    estimatedProfit: number | null;
    grossProfit: number | null;
    machines: number;
    activeMachines: number;
    maintenanceDue: number;
  };
  chart: { date: string; total: number }[];
  salesVsPurchases: { date: string; sales: number; purchases: number }[];
  topProducts: { name: string; total: number; quantity: number }[];
  expenseBreakdown: { name: string; total: number }[];
  stockMovement: { date: string; in: number; out: number }[];
  upcomingMaintenance: { id: string; machine: string; date: string; type: string; cost: number }[];
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

  const { stats } = data;

  return (
    <div>
      <PageHeader
        title={business ? business.name : 'KS Sports'}
        lede="Purchases bring stock in and money goes out. Retail sales send stock out and money comes in. Expenses are the cost of running the shop."
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
            <Check done={data.checklist.product} label="Add a product" href="/products" />
            <Check done={data.checklist.invoice} label="Create the first invoice" href="/invoices/new" />
          </ul>
        </div>
      ) : null}

      <Section title="Sales">
        <Money label="Today's sales" value={stats.todaySales} />
        <Money label="Monthly sales" value={stats.monthSales} />
        <Money label="Total sales" value={stats.totalSales} />
      </Section>
      <Section title="Purchases">
        <Money label="Today's purchases" value={stats.todayPurchases} />
        <Money label="Monthly purchases" value={stats.monthPurchases} />
        <Money label="Outstanding supplier payments" value={stats.supplierOutstanding} />
      </Section>
      <Section title="Inventory">
        <Count label="Total products" value={stats.productCount} />
        <Count label="Total stock" value={stats.stockUnits} />
        <Count label="Low stock" value={stats.lowStock} href="/products" />
        <Count label="Out of stock" value={stats.outOfStock} href="/products" />
      </Section>
      <Section title="Finance">
        <Money label="Receivables" value={stats.receivables} />
        <Money label="Payables" value={stats.payables} />
        <Money label="Expenses this month" value={stats.expenses} />
        <article className="rounded-3xl border border-line bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Estimated profit</p>
          <p className="mt-2 font-serif text-2xl tabular">{stats.estimatedProfit == null ? 'Cost unavailable' : inr(stats.estimatedProfit)}</p>
          <p className="mt-1 text-xs text-muted">Taxable sales minus the purchase cost stored on each bill, then this month’s expenses. Lines without a cost are left out.</p>
        </article>
      </Section>
      <Section title="Machines">
        <Count label="Total machines" value={stats.machines} href="/machines" />
        <Count label="Active machines" value={stats.activeMachines} href="/machines" />
        <Count label="Maintenance due" value={stats.maintenanceDue} href="/machines" />
      </Section>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <ChartCard title="Sales vs purchases">
          <AreaChart data={data.salesVsPurchases}>
            <XAxis dataKey="date" tickFormatter={(value) => prettyDate(String(value)).slice(0, 6)} minTickGap={24} />
            <YAxis tickFormatter={(value) => compact(Number(value))} width={56} />
            <Tooltip formatter={(value) => inr(Number(value))} labelFormatter={(label) => prettyDate(String(label))} />
            <Area type="monotone" dataKey="sales" name="Sales" stroke="#c24d24" fill="#f4e6cf" strokeWidth={2} />
            <Area type="monotone" dataKey="purchases" name="Purchases" stroke="#1d6b58" fill="#d7ebe4" strokeWidth={2} />
          </AreaChart>
        </ChartCard>
        <ChartCard title="Monthly sales">
          <AreaChart data={data.chart}>
            <XAxis dataKey="date" tickFormatter={(value) => prettyDate(String(value)).slice(0, 6)} minTickGap={24} />
            <YAxis tickFormatter={(value) => compact(Number(value))} width={56} />
            <Tooltip formatter={(value) => inr(Number(value))} labelFormatter={(label) => prettyDate(String(label))} />
            <Area type="monotone" dataKey="total" name="Sales" stroke="#c24d24" fill="#f4e6cf" strokeWidth={2} />
          </AreaChart>
        </ChartCard>
        <ChartCard title="Top selling products">
          {data.topProducts.length === 0 ? (
            <p className="text-sm text-muted">No issued sales in this range.</p>
          ) : (
            <BarChart data={data.topProducts} layout="vertical" margin={{ left: 16 }}>
              <XAxis type="number" tickFormatter={(value) => compact(Number(value))} />
              <YAxis type="category" dataKey="name" width={120} />
              <Tooltip formatter={(value) => inr(Number(value))} />
              <Bar dataKey="total" name="Sales" fill="#c24d24" radius={6} />
            </BarChart>
          )}
        </ChartCard>
        <ChartCard title="Expense breakdown">
          {data.expenseBreakdown.length === 0 ? (
            <p className="text-sm text-muted">No expenses recorded this month.</p>
          ) : (
            <BarChart data={data.expenseBreakdown}>
              <XAxis dataKey="name" interval={0} tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(value) => compact(Number(value))} width={56} />
              <Tooltip formatter={(value) => inr(Number(value))} />
              <Bar dataKey="total" name="Spent" fill="#1d6b58" radius={6} />
            </BarChart>
          )}
        </ChartCard>
      </div>

      <section className="mt-6 rounded-3xl border border-line bg-card p-4">
        <h2 className="font-serif text-2xl">Stock movement</h2>
        <p className="text-xs text-muted">Units in from purchases and adjustments. Units out from retail sales.</p>
        <div className="mt-3 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.stockMovement}>
              <XAxis dataKey="date" tickFormatter={(value) => prettyDate(String(value)).slice(0, 6)} minTickGap={24} />
              <YAxis width={40} />
              <Tooltip labelFormatter={(label) => prettyDate(String(label))} />
              <Bar dataKey="in" name="In" fill="#1d6b58" radius={4} />
              <Bar dataKey="out" name="Out" fill="#c24d24" radius={4} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="mt-6">
        <h2 className="mb-3 font-serif text-2xl">Upcoming maintenance</h2>
        {data.upcomingMaintenance.length === 0 ? (
          <Empty title="Nothing scheduled" body="A next service date on a machine shows up here." />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {data.upcomingMaintenance.map((row) => (
              <li key={row.id} className="rounded-3xl border border-line bg-card px-4 py-3 text-sm">
                <Link to="/machines" className="font-semibold">{row.machine}</Link>
                <p className="text-muted">{prettyDate(row.date)} · {row.type} · {inr(row.cost)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6">
        <div className="mb-3 flex items-end justify-between">
          <h2 className="font-serif text-2xl">Recent invoices</h2>
          <p className="text-sm text-muted">{stats.paidInvoices} paid · {stats.pendingInvoices} pending · GST {inr(stats.gstCollected)}</p>
        </div>
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-3 font-serif text-2xl">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{children}</div>
    </section>
  );
}

function Money({ label, value }: { label: string; value: number }) {
  return (
    <article className="rounded-3xl border border-line bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-2 font-serif text-2xl tabular">{inr(value)}</p>
    </article>
  );
}

function Count({ label, value, href }: { label: string; value: number; href?: string }) {
  const body = (
    <article className="rounded-3xl border border-line bg-card px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="font-serif text-3xl tabular">{value}</p>
    </article>
  );
  return href ? <Link to={href}>{body}</Link> : body;
}

function ChartCard({ title, children }: { title: string; children: React.ReactElement }) {
  return (
    <section className="rounded-3xl border border-line bg-card p-4">
      <h2 className="font-serif text-2xl">{title}</h2>
      <div className="mt-3 h-64">
        {'props' in children && children.type !== 'p' ? (
          <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
        ) : (
          children
        )}
      </div>
    </section>
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
