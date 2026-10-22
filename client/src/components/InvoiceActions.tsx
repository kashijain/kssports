import { Download, Eye, Pencil, Printer, Share2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { downloadFile } from '../lib/api';
import { api } from '../lib/api';
import { fail } from '../lib/toast';
import type { InvoiceDetail } from '../types';

export function InvoiceActions({
  id,
  number,
  status,
  showView = true,
}: {
  id: string;
  number: string;
  status: string;
  showView?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {showView ? <IconLink to={`/invoices/${id}`} label="View"><Eye size={16} /></IconLink> : null}
      {status !== 'cancelled' ? <IconLink to={`/invoices/${id}/edit`} label="Edit"><Pencil size={16} /></IconLink> : null}
      <IconButton label="Download" onClick={() => void downloadPdf(id, number)}>
        <Download size={16} />
      </IconButton>
      <IconButton label="Print" onClick={() => window.open(`/api/invoices/${id}/html?print=1`, '_blank', 'noopener')}>
        <Printer size={16} />
      </IconButton>
      <IconButton label="Share" onClick={() => void share(id, status, number)}>
        <Share2 size={16} />
      </IconButton>
    </div>
  );
}

async function downloadPdf(id: string, number: string) {
  try {
    await downloadFile(`/api/invoices/${id}/pdf`, `${number}.pdf`);
  } catch (error) {
    fail(error);
  }
}

async function share(id: string, status: string, number: string) {
  if (status === 'draft') {
    toast.error('Issue the invoice before sharing it.');
    return;
  }
  try {
    const data = await api<{ invoice: InvoiceDetail }>(`/api/invoices/${id}`);
    const url = `${window.location.origin}${data.invoice.sharePath}`;
    const text = `${number} — ${url}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: number, text, url });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }
    await navigator.clipboard.writeText(url);
    toast.success('Share link copied.');
  } catch (error) {
    fail(error);
  }
}

function IconLink({ to, label, children }: { to: string; label: string; children: React.ReactNode }) {
  return (
    <Link to={to} aria-label={label} title={label} className="rounded-full p-2 hover:bg-ink/5">
      {children}
    </Link>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="rounded-full p-2 hover:bg-ink/5">
      {children}
    </button>
  );
}
