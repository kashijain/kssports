import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useMeta } from '../auth';
import { AuthenticatedHtmlFrame } from '../components/AuthenticatedHtmlFrame';
import { InvoiceActions } from '../components/InvoiceActions';
import { Badge, Button, Dialog, Field, PageHeader, SelectInput, Spinner, TextArea, TextInput } from '../components/ui';
import { api, openAuthenticated } from '../lib/api';
import { inr, prettyDate, todayIn } from '../lib/format';
import { fail } from '../lib/toast';
import type { InvoiceDetail } from '../types';

export function InvoiceView() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const meta = useMeta();
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [error, setError] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [reference, setReference] = useState('');
  const [paidAt, setPaidAt] = useState(todayIn());
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');

  function load() {
    setError('');
    api<{ invoice: InvoiceDetail }>(`/api/invoices/${id}`)
      .then((data) => {
        setInvoice(data.invoice);
        setAmount(String(data.invoice.amountDue || ''));
      })
      .catch((err) => {
        setError('This invoice could not be opened.');
        fail(err);
      });
  }

  useEffect(() => {
    load();
  }, [id]);

  async function record(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const data = await api<{ invoice: InvoiceDetail }>('/api/payments', {
        method: 'POST',
        body: JSON.stringify({ invoiceId: id, amount: Number(amount), method, reference, notes, paidAt }),
      });
      setInvoice(data.invoice);
      setAmount(String(data.invoice.amountDue || ''));
      setReference('');
      setNotes('');
      toast.success('Payment recorded.');
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function removePayment(paymentId: string) {
    if (!window.confirm('Remove this payment? The balance will be recalculated.')) return;
    try {
      await api(`/api/payments/${paymentId}`, { method: 'DELETE' });
      toast.success('Payment removed.');
      load();
    } catch (err) {
      fail(err);
    }
  }

  async function cancelInvoice(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const data = await api<{ invoice: InvoiceDetail; warnings?: string[] }>(`/api/invoices/${id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      for (const warning of data.warnings || []) toast(warning);
      setInvoice(data.invoice);
      setCancelOpen(false);
      toast.success('Invoice cancelled.');
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function removeDraft() {
    if (!window.confirm('Delete this draft? The number will not be reused.')) return;
    try {
      await api(`/api/invoices/${id}`, { method: 'DELETE' });
      toast.success('Draft deleted.');
      navigate('/invoices');
    } catch (err) {
      fail(err);
    }
  }

  async function copyLink() {
    if (!invoice) return;
    await navigator.clipboard.writeText(`${window.location.origin}${invoice.sharePath}`);
    toast.success('Link copied.');
  }

  async function printCopy() {
    try {
      await openAuthenticated(`/api/invoices/${id}/html?print=1`);
    } catch (err) {
      fail(err);
    }
  }

  if (error) return <EmptyFallback body={error} onRetry={load} />;
  if (!invoice) return <Spinner />;

  const open = invoice.status === 'unpaid' || invoice.status === 'partial';
  const shareUrl = `${window.location.origin}${invoice.sharePath}`;

  return (
    <div>
      <PageHeader
        title={invoice.number}
        lede={invoice.amountInWords}
        action={<InvoiceActions id={invoice.id} number={invoice.number} status={invoice.status} showView={false} />}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge status={invoice.status} label={invoice.statusLabel} />
        <span className="text-sm text-muted">{invoice.isGstInvoice ? (invoice.supplyType === 'inter' ? 'IGST' : 'CGST + SGST') : 'Non-GST bill'}</span>
        {invoice.status !== 'cancelled' ? (
          <Link to={`/invoices/${invoice.id}/edit`} className="text-sm font-semibold text-clay-dark">
            Edit
          </Link>
        ) : null}
      </div>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <AuthenticatedHtmlFrame path={`/api/invoices/${invoice.id}/html`} title={invoice.number} className="min-h-[900px] w-full rounded-3xl border border-line bg-white" />
        <aside className="grid gap-3">
          {invoice.status !== 'cancelled' ? (
            <section className="grid gap-2 rounded-3xl border border-line bg-card p-4">
              <h2 className="font-serif text-2xl">Shop copy</h2>
              <p className="text-sm text-muted">Print this bill for the counter. Sending it to the customer is below.</p>
              <Button variant="secondary" onClick={() => void printCopy()}>Print a copy</Button>
            </section>
          ) : null}
          <section className="rounded-3xl border border-line bg-card p-4 text-sm">
            <Row label="Total" value={inr(invoice.totals.grandTotal)} />
            <Row label="Paid" value={inr(invoice.amountPaid)} />
            <Row label="Remaining" value={inr(invoice.amountDue)} />
            <p className="mt-2 text-xs text-muted">
              {prettyDate(invoice.invoiceDate)}
              {invoice.dueDate ? ` · due ${prettyDate(invoice.dueDate)}` : ''}
            </p>
            {invoice.cancelReason ? <p className="mt-2 text-xs">Reason: {invoice.cancelReason}</p> : null}
          </section>

          {open ? (
            <form onSubmit={record} className="grid gap-2 rounded-3xl border border-line bg-card p-4">
              <h2 className="font-serif text-2xl">Record payment</h2>
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
          ) : null}

          <section className="rounded-3xl border border-line bg-card p-4">
            <h2 className="font-serif text-2xl">Payment history</h2>
            {invoice.payments.length === 0 ? <p className="mt-2 text-sm text-muted">No payments yet.</p> : null}
            <ul className="mt-2 grid gap-2 text-sm">
              {invoice.payments.map((payment) => (
                <li key={payment.id} className="flex items-start justify-between gap-2 border-t border-line pt-2">
                  <span>
                    {prettyDate(payment.paidAt)} · {payment.methodLabel}
                    {payment.reference ? ` · ${payment.reference}` : ''}
                  </span>
                  <span className="tabular">{inr(payment.amount)}</span>
                  {invoice.status !== 'cancelled' ? (
                    <button type="button" className="text-xs text-clay-dark" onClick={() => void removePayment(payment.id)}>
                      Remove
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>

          {invoice.status !== 'draft' ? (
            <section className="rounded-3xl border border-line bg-card p-4 text-sm">
              <h2 className="font-serif text-2xl">Send to customer</h2>
              <p className="mt-2 break-all text-xs text-muted">{shareUrl}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => void copyLink()}>
                  Copy link
                </Button>
                <a className="inline-flex items-center rounded-full border border-line px-4 py-2 text-sm font-semibold" href={`https://wa.me/?text=${encodeURIComponent(`${invoice.number} ${shareUrl}`)}`} target="_blank" rel="noreferrer">
                  WhatsApp
                </a>
                <a className="inline-flex items-center rounded-full border border-line px-4 py-2 text-sm font-semibold" href={`mailto:?subject=${encodeURIComponent(invoice.number)}&body=${encodeURIComponent(shareUrl)}`}>
                  Email
                </a>
              </div>
            </section>
          ) : (
            <p className="text-sm text-muted">Issue this draft before sharing a public link.</p>
          )}

          {invoice.status === 'draft' ? (
            <Button variant="danger" onClick={() => void removeDraft()}>
              Delete draft
            </Button>
          ) : null}
          {invoice.status !== 'draft' && invoice.status !== 'cancelled' ? (
            <Button variant="secondary" onClick={() => setCancelOpen(true)}>
              Cancel invoice
            </Button>
          ) : null}
        </aside>
      </div>

      <Dialog open={cancelOpen} title="Cancel invoice" onClose={() => setCancelOpen(false)}>
        <form onSubmit={cancelInvoice} className="grid gap-3">
          <p className="text-sm text-muted">The bill stays in history. Stock is put back. It will not count in sales. Payments already recorded stay in the payment list.</p>
          <Field label="Reason">
            <TextArea value={reason} onChange={(event) => setReason(event.target.value)} />
          </Field>
          <Button type="submit" variant="danger" disabled={busy}>
            Cancel invoice
          </Button>
        </form>
      </Dialog>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <p className="flex justify-between py-1">
      <span className="text-muted">{label}</span>
      <span className="font-semibold tabular">{value}</span>
    </p>
  );
}

function EmptyFallback({ body, onRetry }: { body: string; onRetry: () => void }) {
  return (
    <div className="rounded-3xl border border-dashed border-line bg-card px-6 py-12 text-center">
      <p>{body}</p>
      <Button className="mt-4" variant="secondary" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
