import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../auth';
import { CustomerFields } from '../components/CustomerFields';
import { Badge, Button, Dialog, Empty, PageHeader, Spinner, TextInput } from '../components/ui';
import { api } from '../lib/api';
import { customerPayload, emptyCustomer, type CustomerDraft } from '../lib/customer';
import { inr, prettyDate } from '../lib/format';
import { fail } from '../lib/toast';
import type { Customer, InvoiceListItem } from '../types';

function fromCustomer(customer: Customer): CustomerDraft {
  return {
    name: customer.name,
    mobile: customer.mobile,
    email: customer.email,
    gstin: customer.gstin,
    stateCode: customer.stateCode,
    line1: customer.billingAddress.line1 || '',
    line2: customer.billingAddress.line2 || '',
    city: customer.billingAddress.city || '',
    pincode: customer.billingAddress.pincode || '',
    sameAsBilling: customer.sameAsBilling,
    shipLine1: customer.shippingAddress?.line1 || '',
    shipLine2: customer.shippingAddress?.line2 || '',
    shipCity: customer.shippingAddress?.city || '',
    shipPincode: customer.shippingAddress?.pincode || '',
    shipStateCode: customer.shippingAddress?.stateCode || '',
  };
}

export function Customers() {
  const { business } = useAuth();
  const [rows, setRows] = useState<Customer[] | null>(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [draft, setDraft] = useState<CustomerDraft>(emptyCustomer(business?.stateCode || ''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function load(query = q) {
    const params = new URLSearchParams({ limit: '100' });
    if (query.trim()) params.set('q', query.trim());
    api<{ customers: Customer[] }>(`/api/customers?${params}`)
      .then((data) => {
        setRows(data.customers);
        setError('');
      })
      .catch((err) => {
        setError('Customers could not be loaded.');
        fail(err);
      });
  }

  useEffect(() => {
    const handle = window.setTimeout(() => load(q), 200);
    return () => window.clearTimeout(handle);
  }, [q]);

  function startNew() {
    setEditing(null);
    setDraft(emptyCustomer(business?.stateCode || ''));
    setOpen(true);
  }

  function startEdit(customer: Customer) {
    setEditing(customer);
    setDraft(fromCustomer(customer));
    setOpen(true);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const path = editing ? `/api/customers/${editing.id}` : '/api/customers';
      await api(path, { method: editing ? 'PUT' : 'POST', body: JSON.stringify(customerPayload(draft)) });
      toast.success(editing ? 'Customer updated.' : 'Customer added.');
      setOpen(false);
      load();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function remove(customer: Customer) {
    if (!window.confirm(`Remove ${customer.name} from the list? Old invoices keep their copy of the name and address.`)) return;
    try {
      await api(`/api/customers/${customer.id}`, { method: 'DELETE' });
      toast.success('Customer removed.');
      load();
    } catch (err) {
      fail(err);
    }
  }

  return (
    <div>
      <PageHeader title="Customers" lede="A GSTIN is only needed for registered buyers. It prints on their invoices." action={<Button onClick={startNew}>Add customer</Button>} />
      <TextInput className="mb-4 max-w-md" placeholder="Search name, mobile, email, GSTIN" value={q} onChange={(event) => setQ(event.target.value)} />
      {error ? <Empty title="Could not load customers" body={error} action={<Button variant="secondary" onClick={() => load()}>Try again</Button>} /> : null}
      {!rows && !error ? <Spinner /> : null}
      {rows && rows.length === 0 ? <Empty title="No customers yet" body="Add the person or shop you are billing. You can also add them while creating an invoice." action={<Button onClick={startNew}>Add customer</Button>} /> : null}
      {rows && rows.length > 0 ? (
        <div className="grid gap-3">
          {rows.map((customer) => (
            <article key={customer.id} className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-line bg-card px-4 py-3">
              <div>
                <Link to={`/customers/${customer.id}`} className="font-semibold">
                  {customer.name}
                </Link>
                <p className="text-sm text-muted">
                  {[customer.mobile, customer.state, customer.gstin].filter(Boolean).join(' · ') || 'No mobile yet'}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => startEdit(customer)}>
                  Edit
                </Button>
                <Button variant="ghost" onClick={() => void remove(customer)}>
                  Delete
                </Button>
              </div>
            </article>
          ))}
        </div>
      ) : null}
      <Dialog open={open} title={editing ? 'Edit customer' : 'New customer'} onClose={() => setOpen(false)} wide>
        <form onSubmit={save} className="grid gap-3">
          <CustomerFields value={draft} onChange={setDraft} />
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save customer'}
          </Button>
        </form>
      </Dialog>
    </div>
  );
}

export function CustomerDetail() {
  const { id = '' } = useParams();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [invoices, setInvoices] = useState<InvoiceListItem[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ customer: Customer; invoices: InvoiceListItem[] }>(`/api/customers/${id}/invoices`)
      .then((data) => {
        setCustomer(data.customer);
        setInvoices(data.invoices);
      })
      .catch((err) => {
        setError('This customer could not be opened.');
        fail(err);
      });
  }, [id]);

  if (error) return <Empty title="Customer unavailable" body={error} />;
  if (!customer) return <Spinner />;

  const address = [customer.billingAddress.line1, customer.billingAddress.line2, customer.billingAddress.city, customer.billingAddress.pincode].filter(Boolean).join(', ');

  return (
    <div>
      <PageHeader title={customer.name} lede={[customer.mobile, customer.email].filter(Boolean).join(' · ') || 'No contact details yet'} action={<Link to="/customers" className="text-sm font-semibold">All customers</Link>} />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Info label="State" value={`${customer.state} (${customer.stateCode})`} />
        <Info label="GSTIN" value={customer.gstin || 'Not provided'} />
        <Info label="Billing address" value={address || 'Not provided'} />
      </div>
      <h2 className="mb-3 font-serif text-2xl">Billing history</h2>
      {invoices.length === 0 ? <Empty title="No bills for this customer" body="Create an invoice and pick them from the customer list." action={<Link to="/invoices/new"><Button>Create Invoice</Button></Link>} /> : null}
      {invoices.length > 0 ? (
        <div className="overflow-x-auto rounded-3xl border border-line bg-card">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Invoice</th>
                <th>Date</th>
                <th>Amount</th>
                <th>Due</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id} className="border-t border-line">
                  <td className="px-4 py-3 font-semibold">
                    <Link to={`/invoices/${invoice.id}`}>{invoice.number}</Link>
                  </td>
                  <td>{prettyDate(invoice.invoiceDate)}</td>
                  <td className="tabular">{inr(invoice.grandTotal)}</td>
                  <td className="tabular">{inr(invoice.amountDue)}</td>
                  <td>
                    <Badge status={invoice.status} label={invoice.statusLabel} />
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

function Info({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-3xl border border-line bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-sm">{value}</p>
    </article>
  );
}
