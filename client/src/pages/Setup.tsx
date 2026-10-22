import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../auth';
import { StateSelect } from '../components/StateSelect';
import { Button, Field, PageHeader, TextInput } from '../components/ui';
import { api } from '../lib/api';
import { fail, fieldErrors } from '../lib/toast';
import type { Business, Settings } from '../types';

export function Setup() {
  const { user, business, settings, setSession } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: business?.name || '',
    ownerName: business?.ownerName || user?.name || '',
    mobile: business?.mobile || '',
    email: business?.email || user?.email || '',
    addressLine1: business?.address.line1 || '',
    addressLine2: business?.address.line2 || '',
    city: business?.address.city || '',
    stateCode: business?.stateCode || '',
    pincode: business?.pincode || '',
    gstin: business?.gstin || '',
    pan: business?.pan || '',
    upiId: business?.upiId || '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  function set(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const data = await api<{ business: Business; settings: Settings | null }>('/api/business', {
        method: 'PUT',
        body: JSON.stringify({ ...form, bank: business?.bank }),
      });
      if (user) setSession({ user: { ...user, hasBusiness: true }, business: data.business, settings: data.settings ?? settings });
      toast.success(form.gstin.trim() ? 'Shop saved. GST invoices are on.' : 'Shop saved. Bills will be non-GST until you add a GSTIN.');
      navigate('/', { replace: true });
    } catch (error) {
      setErrors(fieldErrors(error));
      fail(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <PageHeader
        title={business ? 'Shop profile' : 'Set up your shop'}
        lede="This is what prints on every bill. GSTIN is optional. Add it only if the shop is registered."
      />
      <form onSubmit={submit} className="grid gap-3 rounded-3xl border border-line bg-card p-5 sm:grid-cols-2">
        <Field label="Shop name" error={errors.name}>
          <TextInput value={form.name} onChange={(event) => set('name', event.target.value)} required />
        </Field>
        <Field label="Owner name" error={errors.ownerName}>
          <TextInput value={form.ownerName} onChange={(event) => set('ownerName', event.target.value)} required />
        </Field>
        <Field label="Mobile" error={errors.mobile}>
          <TextInput value={form.mobile} onChange={(event) => set('mobile', event.target.value)} required />
        </Field>
        <Field label="Email" error={errors.email}>
          <TextInput type="email" value={form.email} onChange={(event) => set('email', event.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Address" error={errors.addressLine1}>
            <TextInput value={form.addressLine1} onChange={(event) => set('addressLine1', event.target.value)} required />
          </Field>
        </div>
        <Field label="Address line 2">
          <TextInput value={form.addressLine2} onChange={(event) => set('addressLine2', event.target.value)} />
        </Field>
        <Field label="City" error={errors.city}>
          <TextInput value={form.city} onChange={(event) => set('city', event.target.value)} required />
        </Field>
        <Field label="State" error={errors.stateCode}>
          <StateSelect value={form.stateCode} onChange={(code) => set('stateCode', code)} required />
        </Field>
        <Field label="Pincode" error={errors.pincode}>
          <TextInput value={form.pincode} onChange={(event) => set('pincode', event.target.value)} inputMode="numeric" maxLength={6} required />
        </Field>
        <Field label="GSTIN (optional)" error={errors.gstin}>
          <TextInput value={form.gstin} onChange={(event) => set('gstin', event.target.value.toUpperCase())} className="uppercase" placeholder="15 characters" />
        </Field>
        <Field label="PAN (optional)" error={errors.pan}>
          <TextInput value={form.pan} onChange={(event) => set('pan', event.target.value.toUpperCase())} className="uppercase" />
        </Field>
        <div className="sm:col-span-2">
          <Field label="UPI ID (optional)" error={errors.upiId}>
            <TextInput value={form.upiId} onChange={(event) => set('upiId', event.target.value)} placeholder="shop@okaxis" />
          </Field>
        </div>
        <p className="text-xs text-muted sm:col-span-2">
          If the GSTIN and the state or PAN do not match, Lekha will stop you. A GSTIN does not by itself make every bill legally complete — you still choose the rate and HSN/SAC.
        </p>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save shop'}
          </Button>
        </div>
      </form>
    </div>
  );
}
