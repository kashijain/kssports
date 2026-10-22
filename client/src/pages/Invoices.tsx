import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { InvoiceActions } from '../components/InvoiceActions';
import { Badge, Button, Empty, PageHeader, SelectInput, Spinner, TextInput } from '../components/ui';
import { api } from '../lib/api';
import { inr, prettyDate, todayIn } from '../lib/format';
import { fail } from '../lib/toast';
import type { Customer, InvoiceListItem } from '../types';

export function Invoices() {
  const [rows, setRows] = useState<InvoiceListItem[] | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ customers: Customer[] }>('/api/customers?limit=100')
      .then((data) => setCustomers(data.customers))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams({ page: String(page), limit: '20' });
    if (q.trim()) params.set('q', q.trim());
    if (status) params.set('status', status);
    if (customerId) params.set('customerId', customerId);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const handle = window.setTimeout(() => {
      setError('');
      api<{ invoices: InvoiceListItem[]; pages: number }>(`/api/invoices?${params}`)
        .then((data) => {
          setRows(data.invoices);
          setPages(data.pages);
        })
        .catch((err) => {
          setError('Invoices could not be loaded.');
          fail(err);
        });
    }, 200);
    return () => window.clearTimeout(handle);
  }, [q, status, customerId, from, to, page]);

  return (
    <div>
      <PageHeader
        title="Invoices"
        lede="Search by number, customer, or date. Cancelled bills stay in the list and drop out of sales."
        action={
          <Link to="/invoices/new">
            <Button>+ Create Invoice</Button>
          </Link>
        }
      />
      <div className="mb-4 grid gap-2 md:grid-cols-5">
        <TextInput placeholder="Search number or customer" value={q} onChange={(event) => { setPage(1); setQ(event.target.value); }} />
        <SelectInput value={status} onChange={(event) => { setPage(1); setStatus(event.target.value); }}>
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="unpaid">Unpaid</option>
          <option value="partial">Advance / part paid</option>
          <option value="paid">Paid</option>
          <option value="cancelled">Cancelled</option>
        </SelectInput>
        <SelectInput value={customerId} onChange={(event) => { setPage(1); setCustomerId(event.target.value); }}>
          <option value="">All customers</option>
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name}
            </option>
          ))}
        </SelectInput>
        <TextInput type="date" value={from} max={to || undefined} onChange={(event) => { setPage(1); setFrom(event.target.value); }} aria-label="From date" />
        <TextInput type="date" value={to} min={from || undefined} onChange={(event) => { setPage(1); setTo(event.target.value); }} aria-label="To date" />
      </div>
      {error ? <Empty title="Could not load invoices" body={error} /> : null}
      {!rows && !error ? <Spinner /> : null}
      {rows && rows.length === 0 ? (
        <Empty title="No invoices in this view" body="Clear a filter, or write a bill for today’s counter." action={<Link to="/invoices/new"><Button>Create Invoice</Button></Link>} />
      ) : null}
      {rows && rows.length > 0 ? (
        <div className="overflow-x-auto rounded-3xl border border-line bg-card">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Invoice</th>
                <th>Customer</th>
                <th>Date</th>
                <th>Due</th>
                <th>Amount</th>
                <th>Due amount</th>
                <th>Status</th>
                <th className="px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-line">
                  <td className="px-4 py-3 font-semibold">
                    <Link to={`/invoices/${row.id}`}>{row.number}</Link>
                    {row.isGstInvoice ? null : <span className="ml-2 text-xs text-muted">Non-GST</span>}
                  </td>
                  <td>{row.customerName}</td>
                  <td>{prettyDate(row.invoiceDate)}</td>
                  <td className={row.dueDate && row.dueDate < todayIn() && (row.status === 'unpaid' || row.status === 'partial') ? 'text-clay-dark' : ''}>{prettyDate(row.dueDate)}</td>
                  <td className="tabular">{inr(row.grandTotal)}</td>
                  <td className="tabular">{inr(row.amountDue)}</td>
                  <td>
                    <Badge status={row.status} label={row.statusLabel} />
                  </td>
                  <td className="px-4">
                    <InvoiceActions id={row.id} number={row.number} status={row.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {pages > 1 ? (
        <div className="mt-4 flex items-center gap-2">
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
            Previous
          </Button>
          <span className="text-sm text-muted">
            Page {page} of {pages}
          </span>
          <Button variant="secondary" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>
            Next
          </Button>
        </div>
      ) : null}
    </div>
  );
}
