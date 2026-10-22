import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useMeta } from '../auth';
import { Button, Dialog, Empty, Field, PageHeader, SelectInput, Spinner, TextInput } from '../components/ui';
import { api } from '../lib/api';
import { inr, prettyDate, todayIn } from '../lib/format';
import { fail } from '../lib/toast';
import type { InvoiceListItem, Payment } from '../types';

export function Payments() {
  const meta = useMeta();
  const [rows, setRows] = useState<Payment[] | null>(null);
  const [openInvoices, setOpenInvoices] = useState<InvoiceListItem[]>([]);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [invoiceId, setInvoiceId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [reference, setReference] = useState('');
  const [paidAt, setPaidAt] = useState(todayIn());
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);

  function load() {
    api<{ payments: Payment[]; pages: number }>(`/api/payments?page=${page}&limit=20`)
      .then((data) => {
        setRows(data.payments);
        setPages(data.pages);
        setError('');
      })
      .catch((err) => {
        setError('Payments could not be loaded.');
        fail(err);
      });
  }

  useEffect(() => {
    load();
  }, [page]);

  async function openDialog() {
    try {
      const [unpaid, partial] = await Promise.all([
        api<{ invoices: InvoiceListItem[] }>('/api/invoices?status=unpaid&limit=100'),
        api<{ invoices: InvoiceListItem[] }>('/api/invoices?status=partial&limit=100'),
      ]);
      const list = [...unpaid.invoices, ...partial.invoices];
      setOpenInvoices(list);
      setInvoiceId(list[0]?.id || '');
      setAmount(list[0] ? String(list[0].amountDue) : '');
      setOpen(true);
    } catch (err) {
      fail(err);
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api('/api/payments', {
        method: 'POST',
        body: JSON.stringify({ invoiceId, amount: Number(amount), method, reference, notes, paidAt }),
      });
      toast.success('Payment recorded.');
      setOpen(false);
      setReference('');
      setNotes('');
      load();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title="Payments" lede="Cash, UPI, bank transfer, card, cheque, or anything else you received against a bill." action={<Button onClick={() => void openDialog()}>Record payment</Button>} />
      {error ? <Empty title="Could not load payments" body={error} action={<Button variant="secondary" onClick={load}>Try again</Button>} /> : null}
      {!rows && !error ? <Spinner /> : null}
      {rows && rows.length === 0 ? <Empty title="No payments yet" body="When a customer pays, record it here or on the invoice." action={<Button onClick={() => void openDialog()}>Record payment</Button>} /> : null}
      {rows && rows.length > 0 ? (
        <div className="overflow-x-auto rounded-3xl border border-line bg-card">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th>Invoice</th>
                <th>Customer</th>
                <th>Method</th>
                <th>Reference</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((payment) => (
                <tr key={payment.id} className="border-t border-line">
                  <td className="px-4 py-3">{prettyDate(payment.paidAt)}</td>
                  <td>
                    <Link className="font-semibold" to={`/invoices/${payment.invoiceId}`}>
                      {payment.invoiceNumber || 'Invoice'}
                    </Link>
                  </td>
                  <td>{payment.customerName}</td>
                  <td>{payment.methodLabel}</td>
                  <td>{payment.reference || '—'}</td>
                  <td className="tabular">{inr(payment.amount)}</td>
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
          <span className="text-sm">
            Page {page} of {pages}
          </span>
          <Button variant="secondary" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>
            Next
          </Button>
        </div>
      ) : null}

      <Dialog open={open} title="Record payment" onClose={() => setOpen(false)}>
        {openInvoices.length === 0 ? (
          <p className="text-sm">Every issued invoice is paid. Nothing is waiting.</p>
        ) : (
          <form onSubmit={save} className="grid gap-3">
            <Field label="Invoice">
              <SelectInput
                value={invoiceId}
                onChange={(event) => {
                  const next = event.target.value;
                  setInvoiceId(next);
                  const invoice = openInvoices.find((item) => item.id === next);
                  setAmount(invoice ? String(invoice.amountDue) : '');
                }}
              >
                {openInvoices.map((invoice) => (
                  <option key={invoice.id} value={invoice.id}>
                    {invoice.number} · {invoice.customerName} · due {inr(invoice.amountDue)}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Amount">
              <TextInput inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} required />
            </Field>
            <Field label="Method">
              <SelectInput value={method} onChange={(event) => setMethod(event.target.value)}>
                {(meta?.paymentMethods ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Reference">
              <TextInput value={reference} onChange={(event) => setReference(event.target.value)} />
            </Field>
            <Field label="Date">
              <TextInput type="date" value={paidAt} onChange={(event) => setPaidAt(event.target.value)} required />
            </Field>
            <Field label="Note">
              <TextInput value={notes} onChange={(event) => setNotes(event.target.value)} />
            </Field>
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save payment'}
            </Button>
          </form>
        )}
      </Dialog>
    </div>
  );
}
