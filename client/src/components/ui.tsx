import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { statusTone } from '../lib/format';

export function Button({
  children,
  variant = 'primary',
  type = 'button',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  const styles = {
    primary: 'bg-clay text-white hover:bg-clay-dark',
    secondary: 'border border-line bg-card hover:bg-amber',
    ghost: 'hover:bg-ink/5',
    danger: 'bg-red-800 text-white hover:bg-red-900',
  }[variant];
  return (
    <button type={type} className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50 ${styles} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-clay-dark">{error}</span> : null}
    </label>
  );
}

export const controlClass =
  'w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none ring-clay/30 placeholder:text-muted/70 focus:ring-2';

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${controlClass} ${props.className || ''}`} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${controlClass} min-h-24 ${props.className || ''}`} />;
}

export function SelectInput(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${controlClass} ${props.className || ''}`} />;
}

export function Dialog({
  open,
  title,
  onClose,
  children,
  wide = false,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} className={`${wide ? 'w-[min(840px,calc(100%-1.5rem))]' : 'w-[min(560px,calc(100%-1.5rem))]'} rounded-2xl shadow-2xl`}>
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <h2 className="font-serif text-2xl">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1 hover:bg-paper">
          <X size={18} />
        </button>
      </div>
      <div className="max-h-[75vh] overflow-auto px-5 py-4">{children}</div>
    </dialog>
  );
}

export function Badge({ status, label }: { status: string; label: string }) {
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusTone(status)}`}>{label}</span>;
}

export function Empty({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-dashed border-line bg-card px-6 py-12 text-center">
      <h3 className="font-serif text-2xl">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">{body}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Spinner() {
  return (
    <div className="grid justify-items-center gap-3" role="status" aria-label="Loading KS Sports">
      <img src="/mark.svg" alt="" className="h-10 w-10" />
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-clay" />
      <p className="text-xs font-semibold tracking-wide text-muted">KS Sports</p>
    </div>
  );
}

export function PageHeader({ title, lede, action }: { title: string; lede?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-serif text-3xl tracking-tight md:text-4xl">{title}</h1>
        {lede ? <p className="mt-1 max-w-2xl text-sm text-muted">{lede}</p> : null}
      </div>
      {action}
    </div>
  );
}
