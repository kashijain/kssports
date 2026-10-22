import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuth, useMeta } from '../auth';
import { StateSelect } from '../components/StateSelect';
import { Button, Field, PageHeader, SelectInput, TextArea, TextInput } from '../components/ui';
import { api } from '../lib/api';
import { fail } from '../lib/toast';
import type { Business, Settings, TaxRate } from '../types';

type Tab = 'profile' | 'invoice' | 'tax' | 'bank' | 'look' | 'inventory' | 'catalog' | 'documents' | 'account';

export function SettingsPage() {
  const { user, business, settings, setSession, refresh } = useAuth();
  const meta = useMeta();
  const [tab, setTab] = useState<Tab>('profile');
  const [nextNumber, setNextNumber] = useState('');
  const [rates, setRates] = useState<TaxRate[]>([]);
  const [busy, setBusy] = useState(false);
  const owner = user?.role === 'owner';

  const [profile, setProfile] = useState({
    name: business?.name || '',
    ownerName: business?.ownerName || '',
    mobile: business?.mobile || '',
    email: business?.email || '',
    addressLine1: business?.address.line1 || '',
    addressLine2: business?.address.line2 || '',
    city: business?.address.city || '',
    stateCode: business?.stateCode || '',
    pincode: business?.pincode || '',
    gstin: business?.gstin || '',
    pan: business?.pan || '',
    upiId: business?.upiId || '',
    bankName: business?.bank?.bankName || '',
    accountName: business?.bank?.accountName || '',
    accountNumber: business?.bank?.accountNumber || '',
    ifsc: business?.bank?.ifsc || '',
  });

  const [invoice, setInvoice] = useState(settings?.invoice);
  const [defaults, setDefaults] = useState(settings?.defaults);
  const [rateValue, setRateValue] = useState('');
  const [rateName, setRateName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [inventory, setInventory] = useState(
    settings?.inventory ?? { allowNegativeStock: false, lowStockThreshold: settings?.defaults.lowStockThreshold ?? 5, valuation: 'purchase' as const },
  );
  const [catalog, setCatalog] = useState(
    settings?.catalog ?? { showRetail: true, showWholesale: true, showGst: false, layout: 'grid' as const, perPage: 6 },
  );
  const [documents, setDocuments] = useState(settings?.documents ?? { maxUploadMb: 8, allowedTypes: ['pdf', 'jpg', 'jpeg', 'png'] });

  useEffect(() => {
    api<{ nextNumber: string; taxRates?: TaxRate[] }>('/api/settings')
      .then((data) => setNextNumber(data.nextNumber))
      .catch(fail);
    api<{ taxRates: TaxRate[] }>('/api/tax-rates')
      .then((data) => setRates(data.taxRates))
      .catch(fail);
  }, []);

  function businessBody() {
    const bankFilled = profile.bankName || profile.accountName || profile.accountNumber || profile.ifsc;
    return {
      name: profile.name,
      ownerName: profile.ownerName,
      mobile: profile.mobile,
      email: profile.email,
      addressLine1: profile.addressLine1,
      addressLine2: profile.addressLine2,
      city: profile.city,
      stateCode: profile.stateCode,
      pincode: profile.pincode,
      gstin: profile.gstin,
      pan: profile.pan,
      upiId: profile.upiId,
      bank: bankFilled
        ? {
            bankName: profile.bankName,
            accountName: profile.accountName,
            accountNumber: profile.accountNumber,
            ifsc: profile.ifsc,
          }
        : null,
    };
  }

  async function saveBusiness(event: React.FormEvent) {
    event.preventDefault();
    if (!owner || !user) return;
    setBusy(true);
    try {
      const data = await api<{ business: Business; settings: Settings | null }>('/api/business', {
        method: 'PUT',
        body: JSON.stringify(businessBody()),
      });
      setSession({ user, business: data.business, settings: data.settings ?? settings });
      toast.success(data.business.gstEnabled ? 'Shop saved. New invoices can include GST.' : 'Shop saved. New invoices will be non-GST.');
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }

  async function saveInvoice(event: React.FormEvent) {
    event.preventDefault();
    if (!invoice) return;
    setBusy(true);
    try {
      const data = await api<{ settings: Settings; nextNumber: string }>('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({ invoice }),
      });
      setInvoice(data.settings.invoice);
      setNextNumber(data.nextNumber);
      await refresh();
      toast.success('Numbering saved.');
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }

  async function saveLook(event: React.FormEvent) {
    event.preventDefault();
    if (!defaults) return;
    setBusy(true);
    try {
      const data = await api<{ settings: Settings; nextNumber: string }>('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({ defaults }),
      });
      setDefaults(data.settings.defaults);
      await refresh();
      toast.success('Invoice defaults saved. Bills already issued stay as they were.');
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }

  async function addRate(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const data = await api<{ taxRate: TaxRate }>('/api/tax-rates', {
        method: 'POST',
        body: JSON.stringify({ rate: Number(rateValue), name: rateName || undefined }),
      });
      setRates((current) => [...current.filter((rate) => rate.id !== data.taxRate.id && rate.rate !== data.taxRate.rate), data.taxRate].sort((a, b) => a.rate - b.rate));
      setRateValue('');
      setRateName('');
      toast.success('GST rate saved.');
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }

  async function patchRate(id: string, patch: { active?: boolean; name?: string }) {
    try {
      const data = await api<{ taxRate: TaxRate; warning?: string }>(`/api/tax-rates/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      setRates((current) => current.map((rate) => (rate.id === id ? data.taxRate : rate)));
      if (data.warning) toast(data.warning);
    } catch (error) {
      fail(error);
    }
  }

  async function upload(kind: 'logo' | 'signature', file: File) {
    if (!user) return;
    const body = new FormData();
    body.append('file', file);
    try {
      const data = await api<{ business: Business }>(`/api/business/${kind}`, { method: 'POST', body });
      setSession({ user, business: data.business, settings });
      toast.success(kind === 'logo' ? 'Logo updated. It appears on new invoices.' : 'Signature updated for new invoices.');
    } catch (error) {
      fail(error);
    }
  }

  async function clearImage(kind: 'logo' | 'signature') {
    if (!user) return;
    try {
      const data = await api<{ business: Business }>(`/api/business/${kind}`, { method: 'DELETE' });
      setSession({ user, business: data.business, settings });
      toast.success('Removed.');
    } catch (error) {
      fail(error);
    }
  }

  async function saveSlice(body: object, message: string) {
    setBusy(true);
    try {
      const data = await api<{ settings: Settings }>('/api/settings', { method: 'PUT', body: JSON.stringify(body) });
      setInventory(data.settings.inventory);
      setCatalog(data.settings.catalog);
      setDocuments(data.settings.documents);
      await refresh();
      toast.success(message);
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }

  function toggleFileType(type: string) {
    setDocuments((current) => {
      const has = current.allowedTypes.includes(type);
      const next = has ? current.allowedTypes.filter((item) => item !== type) : [...current.allowedTypes, type];
      return { ...current, allowedTypes: next.length ? next : current.allowedTypes };
    });
  }

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) });
      setCurrentPassword('');
      setNewPassword('');
      toast.success('Password changed.');
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'profile', label: 'Business profile' },
    { id: 'invoice', label: 'Invoice settings' },
    { id: 'tax', label: 'Tax settings' },
    { id: 'bank', label: 'Bank / UPI' },
    { id: 'look', label: 'Invoice look' },
    { id: 'inventory', label: 'Inventory' },
    { id: 'catalog', label: 'Catalog' },
    { id: 'documents', label: 'Documents' },
    { id: 'account', label: 'Account' },
  ];

  return (
    <div>
      <PageHeader title="Settings" lede="KS Sports profile, invoice numbering, stock rules, and the catalog PDF. Issued bills keep the shop, customer, prices, and tax from the day they were made." />
      {!owner ? <p className="mb-4 rounded-2xl bg-amber px-3 py-2 text-sm">Only the owner can change shop, tax, and invoice settings.</p> : null}
      <div className="mb-4 flex gap-2 overflow-auto">
        {tabs.map((item) => (
          <button key={item.id} type="button" className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm ${tab === item.id ? 'bg-ink text-white' : 'bg-card'}`} onClick={() => setTab(item.id)}>
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'profile' ? (
        <form onSubmit={saveBusiness} className="grid max-w-3xl gap-3 rounded-3xl border border-line bg-card p-4 sm:grid-cols-2">
          <Field label="Shop name"><TextInput value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} required disabled={!owner} /></Field>
          <Field label="Owner name"><TextInput value={profile.ownerName} onChange={(event) => setProfile({ ...profile, ownerName: event.target.value })} required disabled={!owner} /></Field>
          <Field label="Mobile"><TextInput value={profile.mobile} onChange={(event) => setProfile({ ...profile, mobile: event.target.value })} required disabled={!owner} /></Field>
          <Field label="Email"><TextInput value={profile.email} onChange={(event) => setProfile({ ...profile, email: event.target.value })} disabled={!owner} /></Field>
          <div className="sm:col-span-2"><Field label="Address"><TextInput value={profile.addressLine1} onChange={(event) => setProfile({ ...profile, addressLine1: event.target.value })} required disabled={!owner} /></Field></div>
          <Field label="Address line 2"><TextInput value={profile.addressLine2} onChange={(event) => setProfile({ ...profile, addressLine2: event.target.value })} disabled={!owner} /></Field>
          <Field label="City"><TextInput value={profile.city} onChange={(event) => setProfile({ ...profile, city: event.target.value })} required disabled={!owner} /></Field>
          <Field label="State"><StateSelect value={profile.stateCode} disabled={!owner} onChange={(code) => setProfile({ ...profile, stateCode: code })} /></Field>
          <Field label="Pincode"><TextInput value={profile.pincode} onChange={(event) => setProfile({ ...profile, pincode: event.target.value })} required disabled={!owner} /></Field>
          <Field label="GSTIN (optional)"><TextInput className="uppercase" value={profile.gstin} onChange={(event) => setProfile({ ...profile, gstin: event.target.value.toUpperCase() })} disabled={!owner} /></Field>
          <Field label="PAN (optional)"><TextInput className="uppercase" value={profile.pan} onChange={(event) => setProfile({ ...profile, pan: event.target.value.toUpperCase() })} disabled={!owner} /></Field>
          <p className="text-xs text-muted sm:col-span-2">Leave GSTIN blank for ordinary bills. Adding or removing it does not rewrite invoices you already issued.</p>
          {owner ? <div className="sm:col-span-2"><Button type="submit" disabled={busy}>Save profile</Button></div> : null}
        </form>
      ) : null}

      {tab === 'invoice' && invoice ? (
        <form onSubmit={saveInvoice} className="grid max-w-3xl gap-3 rounded-3xl border border-line bg-card p-4 sm:grid-cols-2">
          <p className="text-sm sm:col-span-2">Next number ready to use: <span className="font-semibold">{nextNumber || '—'}</span></p>
          <Field label="Prefix"><TextInput value={invoice.prefix} onChange={(event) => setInvoice({ ...invoice, prefix: event.target.value.toUpperCase() })} disabled={!owner} /></Field>
          <Field label="Separator">
            <SelectInput value={invoice.separator} onChange={(event) => setInvoice({ ...invoice, separator: event.target.value as '-' | '/' })} disabled={!owner}>
              <option value="-">Hyphen</option>
              <option value="/">Slash</option>
            </SelectInput>
          </Field>
          <Field label="Digits"><TextInput type="number" min={1} max={8} value={invoice.padLength} onChange={(event) => setInvoice({ ...invoice, padLength: Number(event.target.value) })} disabled={!owner} /></Field>
          <Field label="Starting number"><TextInput type="number" min={1} value={invoice.startingNumber} onChange={(event) => setInvoice({ ...invoice, startingNumber: Number(event.target.value) })} disabled={!owner} /></Field>
          <Field label="Financial year in the number">
            <SelectInput value={invoice.includeFinancialYear ? 'yes' : 'no'} onChange={(event) => setInvoice({ ...invoice, includeFinancialYear: event.target.value === 'yes' })} disabled={!owner}>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </SelectInput>
          </Field>
          <Field label="Year style">
            <SelectInput value={invoice.fyStyle} onChange={(event) => setInvoice({ ...invoice, fyStyle: event.target.value as 'start_year' | 'range' })} disabled={!owner}>
              <option value="start_year">2026</option>
              <option value="range">2026-27</option>
            </SelectInput>
          </Field>
          <Field label="FY starts in month"><TextInput type="number" min={1} max={12} value={invoice.fyStartMonth} onChange={(event) => setInvoice({ ...invoice, fyStartMonth: Number(event.target.value) })} disabled={!owner} /></Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={invoice.resetEachFinancialYear} onChange={(event) => setInvoice({ ...invoice, resetEachFinancialYear: event.target.checked })} disabled={!owner} />
            Start again at the beginning of each financial year
          </label>
          <p className="text-xs text-muted sm:col-span-2">Example shape: INV-2026-0001. Numbers already used are never given out again, including deleted drafts.</p>
          {owner ? <div className="sm:col-span-2"><Button type="submit" disabled={busy}>Save numbering</Button></div> : null}
        </form>
      ) : null}

      {tab === 'tax' ? (
        <div className="max-w-3xl rounded-3xl border border-line bg-card p-4">
          <p className="text-sm text-muted">These are the rates KS Sports can put on a bill. The list is yours to edit. It is not treated as a legal schedule.</p>
          <ul className="mt-4 grid gap-2">
            {rates.map((rate) => (
              <li key={rate.id} className="flex items-center justify-between gap-3 rounded-2xl border border-line px-3 py-2">
                <span>
                  {rate.name} <span className="text-muted">{rate.rate}%</span>
                </span>
                <Button variant="secondary" disabled={!owner} onClick={() => void patchRate(rate.id, { active: !rate.active })}>
                  {rate.active ? 'Active' : 'Off'}
                </Button>
              </li>
            ))}
          </ul>
          {owner ? (
            <form onSubmit={addRate} className="mt-4 grid gap-2 sm:grid-cols-[120px_1fr_auto]">
              <TextInput inputMode="decimal" placeholder="Rate" value={rateValue} onChange={(event) => setRateValue(event.target.value)} required />
              <TextInput placeholder="Name, optional" value={rateName} onChange={(event) => setRateName(event.target.value)} />
              <Button type="submit" disabled={busy}>Add rate</Button>
            </form>
          ) : null}
        </div>
      ) : null}

      {tab === 'bank' ? (
        <form onSubmit={saveBusiness} className="grid max-w-3xl gap-3 rounded-3xl border border-line bg-card p-4 sm:grid-cols-2">
          <Field label="UPI ID"><TextInput value={profile.upiId} onChange={(event) => setProfile({ ...profile, upiId: event.target.value })} disabled={!owner} placeholder="shop@okaxis" /></Field>
          <p className="text-sm text-muted sm:col-span-2">If a UPI ID is saved, invoices that still have a balance show a QR for that ID and the amount due.</p>
          <Field label="Bank name"><TextInput value={profile.bankName} onChange={(event) => setProfile({ ...profile, bankName: event.target.value })} disabled={!owner} /></Field>
          <Field label="Account name"><TextInput value={profile.accountName} onChange={(event) => setProfile({ ...profile, accountName: event.target.value })} disabled={!owner} /></Field>
          <Field label="Account number"><TextInput value={profile.accountNumber} onChange={(event) => setProfile({ ...profile, accountNumber: event.target.value })} disabled={!owner} /></Field>
          <Field label="IFSC"><TextInput className="uppercase" value={profile.ifsc} onChange={(event) => setProfile({ ...profile, ifsc: event.target.value.toUpperCase() })} disabled={!owner} /></Field>
          {owner ? <div className="sm:col-span-2"><Button type="submit" disabled={busy}>Save bank and UPI</Button></div> : null}
        </form>
      ) : null}

      {tab === 'look' && defaults ? (
        <form onSubmit={saveLook} className="grid max-w-3xl gap-3 rounded-3xl border border-line bg-card p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <ImageField label="Logo" url={business?.logoUrl || ''} onFile={(file) => void upload('logo', file)} onClear={() => void clearImage('logo')} disabled={!owner} />
            <ImageField label="Signature" url={business?.signatureUrl || ''} onFile={(file) => void upload('signature', file)} onClear={() => void clearImage('signature')} disabled={!owner} />
          </div>
          <Field label="Template">
            <SelectInput value={defaults.template} onChange={(event) => setDefaults({ ...defaults, template: event.target.value as Settings['defaults']['template'] })} disabled={!owner}>
              {(meta?.templates ?? []).map((template) => (
                <option key={template.id} value={template.id}>
                  {template.label} — {template.detail}
                </option>
              ))}
            </SelectInput>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Title when GSTIN is set"><TextInput value={defaults.documentTitleGst} onChange={(event) => setDefaults({ ...defaults, documentTitleGst: event.target.value })} disabled={!owner} /></Field>
            <Field label="Title without GSTIN"><TextInput value={defaults.documentTitlePlain} onChange={(event) => setDefaults({ ...defaults, documentTitlePlain: event.target.value })} disabled={!owner} /></Field>
            <Field label="Payment terms (days)"><TextInput type="number" min={0} value={defaults.paymentTermsDays} onChange={(event) => setDefaults({ ...defaults, paymentTermsDays: Number(event.target.value) })} disabled={!owner} /></Field>
            <Field label="Signatory"><TextInput value={defaults.signatory} onChange={(event) => setDefaults({ ...defaults, signatory: event.target.value })} disabled={!owner} /></Field>
            <Field label="Prices">
              <SelectInput value={defaults.priceMode} onChange={(event) => setDefaults({ ...defaults, priceMode: event.target.value as 'exclusive' | 'inclusive' })} disabled={!owner}>
                <option value="exclusive">Tax extra</option>
                <option value="inclusive">Tax included in the rate</option>
              </SelectInput>
            </Field>
            <Field label="Round off">
              <SelectInput value={defaults.roundOff} onChange={(event) => setDefaults({ ...defaults, roundOff: event.target.value as 'nearest_rupee' | 'none' })} disabled={!owner}>
                <option value="nearest_rupee">Nearest rupee</option>
                <option value="none">Keep paise</option>
              </SelectInput>
            </Field>
            <Field label="Timezone"><TextInput value={defaults.timezone} onChange={(event) => setDefaults({ ...defaults, timezone: event.target.value })} disabled={!owner} /></Field>
            <Field label="Low-stock reminder"><TextInput type="number" min={0} value={defaults.lowStockThreshold} onChange={(event) => setDefaults({ ...defaults, lowStockThreshold: Number(event.target.value) })} disabled={!owner} /></Field>
          </div>
          <Field label="Default notes"><TextArea value={defaults.notes} onChange={(event) => setDefaults({ ...defaults, notes: event.target.value })} disabled={!owner} /></Field>
          <Field label="Terms & conditions"><TextArea value={defaults.terms} onChange={(event) => setDefaults({ ...defaults, terms: event.target.value })} disabled={!owner} /></Field>
          <Field label="Footer"><TextInput value={defaults.footer} onChange={(event) => setDefaults({ ...defaults, footer: event.target.value })} disabled={!owner} /></Field>
          {owner ? <Button type="submit" disabled={busy}>Save invoice look</Button> : null}
        </form>
      ) : null}

      {tab === 'inventory' ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void saveSlice({ inventory }, 'Inventory settings saved.');
          }}
          className="grid max-w-3xl gap-3 rounded-3xl border border-line bg-card p-4"
        >
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={inventory.allowNegativeStock} disabled={!owner} onChange={(event) => setInventory({ ...inventory, allowNegativeStock: event.target.checked })} />
            Allow negative stock
          </label>
          <p className="text-xs text-muted">Off by default. A sale or purchase that would take stock below zero is refused until this is turned on.</p>
          <Field label="Low stock threshold">
            <TextInput type="number" min={0} value={inventory.lowStockThreshold} disabled={!owner} onChange={(event) => setInventory({ ...inventory, lowStockThreshold: Number(event.target.value) })} />
          </Field>
          <Field label="Stock valuation">
            <SelectInput value={inventory.valuation} disabled={!owner} onChange={(event) => setInventory({ ...inventory, valuation: event.target.value as Settings['inventory']['valuation'] })}>
              <option value="purchase">Purchase price</option>
              <option value="average">Latest purchase price</option>
              <option value="retail">Retail price</option>
            </SelectInput>
          </Field>
          <p className="text-xs text-muted">Average currently uses the latest purchase price. A product with no purchase cost is shown as cost unavailable.</p>
          {owner ? <Button type="submit" disabled={busy}>Save inventory</Button> : null}
        </form>
      ) : null}

      {tab === 'catalog' ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void saveSlice({ catalog }, 'Catalog settings saved.');
          }}
          className="grid max-w-3xl gap-3 rounded-3xl border border-line bg-card p-4"
        >
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={catalog.showRetail} disabled={!owner} onChange={(event) => setCatalog({ ...catalog, showRetail: event.target.checked })} /> Show retail price</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={catalog.showWholesale} disabled={!owner} onChange={(event) => setCatalog({ ...catalog, showWholesale: event.target.checked })} /> Show wholesale price</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={catalog.showGst} disabled={!owner} onChange={(event) => setCatalog({ ...catalog, showGst: event.target.checked })} /> Show GST</label>
          <Field label="Layout">
            <SelectInput value={catalog.layout} disabled={!owner} onChange={(event) => setCatalog({ ...catalog, layout: event.target.value as Settings['catalog']['layout'] })}>
              <option value="grid">Grid</option>
              <option value="list">List</option>
            </SelectInput>
          </Field>
          <Field label="Products per page">
            <TextInput type="number" min={1} max={12} value={catalog.perPage} disabled={!owner} onChange={(event) => setCatalog({ ...catalog, perPage: Number(event.target.value) })} />
          </Field>
          {owner ? <Button type="submit" disabled={busy}>Save catalog</Button> : null}
        </form>
      ) : null}

      {tab === 'documents' ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void saveSlice({ documents }, 'Document settings saved.');
          }}
          className="grid max-w-3xl gap-3 rounded-3xl border border-line bg-card p-4"
        >
          <Field label="Maximum upload size (MB)">
            <TextInput type="number" min={1} max={20} value={documents.maxUploadMb} disabled={!owner} onChange={(event) => setDocuments({ ...documents, maxUploadMb: Number(event.target.value) })} />
          </Field>
          <fieldset className="grid gap-2 text-sm">
            <legend className="mb-1 font-medium">Allowed file types</legend>
            {['pdf', 'jpg', 'jpeg', 'png'].map((type) => (
              <label key={type} className="flex items-center gap-2 uppercase">
                <input type="checkbox" checked={documents.allowedTypes.includes(type)} disabled={!owner} onChange={() => toggleFileType(type)} />
                {type}
              </label>
            ))}
          </fieldset>
          <p className="text-xs text-muted">Supplier bills, machine papers, and expense receipts stay private and are served only to a signed-in user.</p>
          {owner ? <Button type="submit" disabled={busy}>Save documents</Button> : null}
        </form>
      ) : null}

      {tab === 'account' ? (
        <form onSubmit={changePassword} className="grid max-w-md gap-3 rounded-3xl border border-line bg-card p-4">
          <p className="text-sm text-muted">{user?.email}</p>
          <Field label="Current password"><TextInput type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></Field>
          <Field label="New password"><TextInput type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /></Field>
          <Button type="submit" disabled={busy}>Change password</Button>
        </form>
      ) : null}
    </div>
  );
}

function ImageField({
  label,
  url,
  onFile,
  onClear,
  disabled,
}: {
  label: string;
  url: string;
  onFile: (file: File) => void;
  onClear: () => void;
  disabled: boolean;
}) {
  return (
    <div>
      <p className="mb-1 text-sm font-medium">{label}</p>
      {url ? <img src={url} alt="" className="mb-2 h-16 max-w-full object-contain" /> : <p className="mb-2 text-xs text-muted">None yet. PNG, JPG, or WebP under 1.5 MB.</p>}
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
          event.target.value = '';
        }}
      />
      {url && !disabled ? (
        <button type="button" className="mt-2 block text-xs text-clay-dark" onClick={onClear}>
          Remove
        </button>
      ) : null}
    </div>
  );
}
