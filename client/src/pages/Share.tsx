import { Link, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Button, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { inr } from '../lib/format';
import type { InvoiceDetail } from '../types';

export function SharePage() {
  const { token = '' } = useParams();
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    api<{ invoice: InvoiceDetail }>(`/api/public/invoices/${token}`)
      .then((data) => setInvoice(data.invoice))
      .catch(() => setMissing(true));
  }, [token]);

  if (missing) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="font-serif text-4xl">Lekha</p>
        <h1 className="mt-4 font-serif text-3xl">This link is not available</h1>
        <p className="mt-2 text-sm text-muted">The invoice may still be a draft, or the shop may have replaced the link.</p>
      </div>
    );
  }
  if (!invoice) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-serif text-3xl">Lekha</p>
          <h1 className="text-lg font-semibold">{invoice.number}</h1>
          <p className="text-sm text-muted">
            {invoice.customer.name} · {inr(invoice.totals.grandTotal)}
            {invoice.amountDue > 0 ? ` · ${inr(invoice.amountDue)} due` : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <a href={`/api/public/invoices/${token}/pdf`}>
            <Button>Download PDF</Button>
          </a>
          <Button variant="secondary" onClick={() => window.open(`/api/public/invoices/${token}/html?print=1`, '_blank', 'noopener')}>
            Print
          </Button>
        </div>
      </div>
      <iframe title={invoice.number} className="min-h-[900px] w-full rounded-3xl border border-line bg-white" src={`/api/public/invoices/${token}/html`} />
      <p className="mt-4 text-center text-xs text-muted">
        Shared from the shop’s Lekha account. <Link to="/login">Shop sign in</Link>
      </p>
    </div>
  );
}
