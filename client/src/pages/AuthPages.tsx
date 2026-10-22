import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../auth';
import { Button, Field, TextInput } from '../components/ui';
import { api } from '../lib/api';
import { fail, fieldErrors } from '../lib/toast';
import type { Business, Settings, User } from '../types';

export function Login() {
  const { setSession, user, business, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const from = (location.state as { from?: string } | null)?.from || '/';

  if (!loading && user) return <Redirect home={business ? from : '/setup'} />;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const session = await api<{ user: User; business: Business | null; settings: Settings | null }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setSession(session);
      navigate(session.business ? from : '/setup', { replace: true });
    } catch (error) {
      setErrors(fieldErrors(error));
      fail(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame title="Sign in" lede="Open the counter book for your shop.">
      <form onSubmit={submit} className="grid gap-3">
        <Field label="Email" error={errors.email}>
          <TextInput type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </Field>
        <Field label="Password" error={errors.password}>
          <TextInput type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </Field>
        <Button type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
        <div className="flex justify-between text-sm">
          <Link to="/forgot" className="text-clay-dark underline">
            Forgot password
          </Link>
          <Link to="/register" className="font-semibold">
            Create an account
          </Link>
        </div>
        <p className="rounded-2xl bg-amber px-3 py-2 text-xs text-ink">
          Try the sample business with <span className="font-semibold">demo@kssports.test</span> and <span className="font-semibold">Demo@12345</span>.
        </p>
      </form>
    </AuthFrame>
  );
}

export function Register() {
  const { setSession, user, loading } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  if (!loading && user) return <Redirect home="/" />;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const session = await api<{ user: User; business: Business | null; settings: Settings | null }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ name, email, password }),
      });
      setSession(session);
      toast.success('Account created. Add your shop details next.');
      navigate('/setup', { replace: true });
    } catch (error) {
      setErrors(fieldErrors(error));
      fail(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame title="Create your account" lede="One owner login for your customers, products, and bills.">
      <form onSubmit={submit} className="grid gap-3">
        <Field label="Your name" error={errors.name}>
          <TextInput value={name} onChange={(event) => setName(event.target.value)} required />
        </Field>
        <Field label="Email" error={errors.email}>
          <TextInput type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </Field>
        <Field label="Password" error={errors.password}>
          <TextInput type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </Field>
        <p className="text-xs text-muted">Use at least 8 characters, with a letter and a number.</p>
        <Button type="submit" disabled={busy}>
          {busy ? 'Creating…' : 'Create account'}
        </Button>
        <Link to="/login" className="text-sm font-semibold">
          I already have an account
        </Link>
      </form>
    </AuthFrame>
  );
}

export function Forgot() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [resetUrl, setResetUrl] = useState('');
  const [message, setMessage] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const data = await api<{ message: string; resetUrl?: string }>('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setMessage(data.message);
      setResetUrl(data.resetUrl || '');
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame title="Reset password" lede="We will prepare a link for this email.">
      <form onSubmit={submit} className="grid gap-3">
        <Field label="Email">
          <TextInput type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </Field>
        <Button type="submit" disabled={busy}>
          {busy ? 'Checking…' : 'Send reset link'}
        </Button>
        {message ? <p className="text-sm">{message}</p> : null}
        {resetUrl ? (
          <p className="rounded-2xl bg-amber px-3 py-2 text-sm">
            Mail is not connected on this copy of KS Sports. Use this one-hour link:{' '}
            <Link className="font-semibold underline" to={resetUrl}>
              Reset password
            </Link>
          </p>
        ) : null}
        <Link to="/login" className="text-sm font-semibold">
          Back to sign in
        </Link>
      </form>
    </AuthFrame>
  );
}

export function Reset() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) });
      toast.success('Password updated. Sign in with the new one.');
      navigate('/login', { replace: true });
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame title="Choose a new password" lede="This signs you out of other browsers.">
      <form onSubmit={submit} className="grid gap-3">
        <Field label="New password">
          <TextInput type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </Field>
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Update password'}
        </Button>
      </form>
    </AuthFrame>
  );
}

function Redirect({ home }: { home: string }) {
  return <Navigate to={home} replace />;
}

function AuthFrame({ title, lede, children }: { title: string; lede: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <section className="hidden flex-col justify-between bg-sidebar p-10 text-paper md:flex">
        <div>
          <img src="/mark.svg" alt="" className="h-14 w-14" />
          <p className="mt-4 font-serif text-5xl">KS Sports</p>
          <p className="mt-3 max-w-sm text-paper/70">Purchases, stock, retail bills, machines, and the cost of running the workshop.</p>
        </div>
        <p className="max-w-sm text-sm text-paper/60">
          A GSTIN turns on tax invoices with CGST, SGST, and IGST. Without one, KS Sports prints a normal bill and leaves GST off the page.
        </p>
      </section>
      <section className="flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <p className="font-serif text-4xl md:hidden">KS Sports</p>
          <h1 className="mt-4 font-serif text-4xl">{title}</h1>
          <p className="mb-6 mt-2 text-sm text-muted">{lede}</p>
          {children}
        </div>
      </section>
    </div>
  );
}
