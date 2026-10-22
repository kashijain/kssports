import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { InvoiceActions } from '../components/InvoiceActions';
import { Badge, Button, Empty, PageHeader, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { inr, prettyDate } from '../lib/format';
import { fail } from '../lib/toast';

interface Sale {
  id: string;
  number: string;
  invoiceDate: string;
  customerName: string;
  status: string;
  statusLabel: string;
  grandTotal: number;
  gst: number;
  items: { name: string; quantity: number }[];
  grossProfit: number | null;
  costUnavailable: boolean;
}

export function Sales() {
  const [rows, setRows] = useState<Sale[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ sales: Sale[] }>('/api/sales?limit=50')
      .then((data) => setRows(data.sales))
      .catch((err) => {
        setError('Sales could not be loaded.');
        fail(err);
      });
  }, []);

  return (
    <div>
      <PageHeader
        title="Sales"
        lede="Money coming in. Every retail invoice from billing is listed here. Profit uses the purchase cost stored on the bill."
        action={<Link to="/invoices/new"><Button>+ Create Invoice</Button></Link>}
      />
      {error ? <Empty title="Sales unavailable" body={error} /> : null}
      {!rows && !error ? <Spinner /> : null}
      {rows && rows.length === 0 ? <Empty title="No sales yet" body="Create an invoice and it will show up here." action={<Link to="/invoices/new"><Button>Create Invoice</Button></Link>} /> : null}
      {rows && rows.length > 0 ? (
        <div className="overflow-x-auto rounded-3xl border border-line bg-card">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="text-xs uppercase text-muted">
              <tr><th className="px-4 py-3">Invoice</th><th>Date</th><th>Customer</th><th>Products</th><th>Total</th><th>GST</th><th>Profit</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-line">
                  <td className="px-4 py-3 font-semibold"><Link to={`/invoices/${row.id}`}>{row.number}</Link></td>
                  <td>{prettyDate(row.invoiceDate)}</td>
                  <td>{row.customerName}</td>
                  <td>{row.items.map((item) => `${item.name} × ${item.quantity}`).join(', ')}</td>
                  <td>{inr(row.grandTotal)}</td>
                  <td>{inr(row.gst)}</td>
                  <td>{row.grossProfit == null ? 'Cost unavailable' : `${inr(row.grossProfit)}${row.costUnavailable ? ' · some costs missing' : ''}`}</td>
                  <td><Badge status={row.status} label={row.statusLabel} /></td>
                  <td><InvoiceActions id={row.id} number={row.number} status={row.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
