import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { DocumentFileLink } from '../components/DocumentFileLink';
import { Button, Dialog, Empty, Field, PageHeader, SelectInput, Spinner, TextArea, TextInput } from '../components/ui';
import { api } from '../lib/api';
import { inr, prettyDate } from '../lib/format';
import { fail } from '../lib/toast';

interface Machine {
  id: string;
  name: string;
  machineType: string;
  machineCode: string;
  brand: string;
  model: string;
  serialNumber: string;
  purchaseDate: string;
  purchasePrice: number;
  supplierName: string;
  warrantyStart: string;
  warrantyEnd: string;
  installationDate: string;
  status: string;
  location: string;
  notes: string;
  photoUrl: string;
  maintenanceCost?: number;
}
interface Doc { id: string; name: string; size: number; fileType: string }
interface Job { id: string; date: string; maintenanceType: string; vendor: string; cost: number; description: string; nextDate: string; documents?: Doc[] }
interface MachineDetail { machine: Machine; maintenance: Job[]; maintenanceCost: number; documents?: Doc[] }

const blank = { name: '', machineType: '', machineCode: '', brand: '', model: '', serialNumber: '', purchaseDateKey: '', purchasePrice: 0, supplierName: '', warrantyStart: '', warrantyEnd: '', installationDate: '', status: 'active', location: '', notes: '' };

export function Machines() {
  const { id } = useParams();
  const [rows, setRows] = useState<Machine[] | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);
  const [detail, setDetail] = useState<MachineDetail | null>(null);
  const [job, setJob] = useState({ dateKey: '', maintenanceType: 'Service', vendor: '', cost: '', description: '', nextDateKey: '' });
  const [jobFile, setJobFile] = useState<File | null>(null);

  function load() {
    api<{ machines: Machine[] }>('/api/machines').then((data) => setRows(data.machines)).catch(fail);
  }
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!id) { setDetail(null); return; }
    api<MachineDetail>(`/api/machines/${id}`).then(setDetail).catch(fail);
  }, [id]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    try {
      await api('/api/machines', { method: 'POST', body: JSON.stringify({ ...form, purchasePrice: Number(form.purchasePrice) || 0 }) });
      toast.success('Machine saved.');
      setOpen(false);
      load();
    } catch (error) { fail(error); }
  }

  async function addJob(event: React.FormEvent) {
    event.preventDefault();
    if (!detail) return;
    try {
      const created = await api<{ maintenance: { id: string } }>(`/api/machines/${detail.machine.id}/maintenance`, { method: 'POST', body: JSON.stringify({ ...job, cost: Number(job.cost) || 0 }) });
      if (jobFile) await attach('maintenance', created.maintenance.id, jobFile);
      setJobFile(null);
      toast.success('Maintenance recorded.');
      const fresh = await api<MachineDetail>(`/api/machines/${detail.machine.id}`);
      setDetail(fresh);
    } catch (error) { fail(error); }
  }

  async function attach(moduleName: 'machine' | 'maintenance', recordId: string, file: File) {
    const body = new FormData();
    body.append('file', file);
    body.append('module', moduleName);
    body.append('recordId', recordId);
    await api('/api/documents', { method: 'POST', body });
  }

  async function reloadDetail() {
    if (!detail) return;
    setDetail(await api<MachineDetail>(`/api/machines/${detail.machine.id}`));
  }

  if (id && detail) {
    return (
      <div>
        <PageHeader title={detail.machine.name} lede={`${detail.machine.machineType || 'Machine'} · ${detail.machine.location || 'No location'} · ${detail.machine.status}`} />
        <div className="mb-4 grid gap-3 sm:grid-cols-3 text-sm">
          <Info label="Brand / model" value={[detail.machine.brand, detail.machine.model].filter(Boolean).join(' ') || '—'} />
          <Info label="Serial" value={detail.machine.serialNumber || '—'} />
          <Info label="Maintenance cost" value={inr(detail.maintenanceCost)} />
          <Info label="Purchased" value={prettyDate(detail.machine.purchaseDate)} />
          <Info label="Warranty" value={detail.machine.warrantyEnd ? `until ${prettyDate(detail.machine.warrantyEnd)}` : '—'} />
          <Info label="Supplier" value={detail.machine.supplierName || '—'} />
        </div>
        {detail.machine.photoUrl ? <img src={detail.machine.photoUrl} alt="" className="mb-4 max-h-64 rounded-3xl" /> : <img src="/logo.png" alt="KS Sports" className="mb-4 h-16 w-16 rounded-full object-cover" />}
        <label className="mb-4 inline-block text-sm font-semibold">
          Upload photo
          <input type="file" accept="image/png,image/jpeg,image/webp" className="mt-1 block" onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            const body = new FormData();
            body.append('file', file);
            void api(`/api/machines/${detail.machine.id}/photo`, { method: 'POST', body }).then(() => api<MachineDetail>(`/api/machines/${detail.machine.id}`)).then(setDetail).catch(fail);
          }} />
        </label>
        <h2 className="mt-4 font-serif text-2xl">Documents</h2>
        {(detail.documents || []).length === 0 ? <p className="text-sm text-muted">No papers attached to this machine.</p> : null}
        <ul className="text-sm">
          {(detail.documents || []).map((doc) => (
            <li key={doc.id} className="flex flex-wrap gap-3 border-t border-line py-2">
              <span>{doc.name}</span>
              <span className="text-muted">{doc.fileType} · {(doc.size / 1024).toFixed(0)} KB</span>
              <DocumentFileLink id={doc.id} name={doc.name} mode="view">View</DocumentFileLink>
              <DocumentFileLink id={doc.id} name={doc.name} mode="download">Download</DocumentFileLink>
            </li>
          ))}
        </ul>
        <label className="mt-2 inline-block text-sm font-semibold">
          Upload document
          <input type="file" accept="application/pdf,image/jpeg,image/png" className="mt-1 block" onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            void attach('machine', detail.machine.id, file).then(reloadDetail).then(() => toast.success('Document attached.')).catch(fail);
          }} />
        </label>
        <h2 className="mt-6 font-serif text-2xl">Maintenance</h2>
        {detail.maintenance.length === 0 ? <p className="text-sm text-muted">No service recorded.</p> : null}
        <ul className="mt-2 text-sm">
          {detail.maintenance.map((item) => (
            <li key={item.id} className="border-t border-line py-2">
              {prettyDate(item.date)} · {item.maintenanceType} · {item.vendor || 'No vendor'} · {inr(item.cost)}{item.nextDate ? ` · next ${prettyDate(item.nextDate)}` : ''}
              {(item.documents || []).map((doc) => (
                <DocumentFileLink key={doc.id} id={doc.id} name={doc.name} mode="view" className="ml-3 inline font-semibold">{doc.name}</DocumentFileLink>
              ))}
            </li>
          ))}
        </ul>
        <form onSubmit={addJob} className="mt-4 grid gap-2 rounded-3xl border border-line bg-card p-4 sm:grid-cols-2">
          <Field label="Date"><TextInput type="date" value={job.dateKey} onChange={(event) => setJob({ ...job, dateKey: event.target.value })} required /></Field>
          <Field label="Type"><TextInput value={job.maintenanceType} onChange={(event) => setJob({ ...job, maintenanceType: event.target.value })} /></Field>
          <Field label="Technician / vendor"><TextInput value={job.vendor} onChange={(event) => setJob({ ...job, vendor: event.target.value })} /></Field>
          <Field label="Cost"><TextInput value={job.cost} onChange={(event) => setJob({ ...job, cost: event.target.value })} /></Field>
          <Field label="Next date"><TextInput type="date" value={job.nextDateKey} onChange={(event) => setJob({ ...job, nextDateKey: event.target.value })} /></Field>
          <Field label="Description"><TextArea value={job.description} onChange={(event) => setJob({ ...job, description: event.target.value })} /></Field>
          <Field label="Invoice / document">
            <input type="file" accept="application/pdf,image/jpeg,image/png" onChange={(event) => setJobFile(event.target.files?.[0] || null)} />
          </Field>
          <Button type="submit">Save maintenance</Button>
        </form>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Machines" lede="Presses, stitchers, and the other machines KS Sports runs." action={<Button onClick={() => setOpen(true)}>Add machine</Button>} />
      {!rows ? <Spinner /> : null}
      {rows && rows.length === 0 ? <Empty title="No machines yet" body="Add the first machine and its warranty dates." action={<Button onClick={() => setOpen(true)}>Add machine</Button>} /> : null}
      <div className="grid gap-3 md:grid-cols-2">
        {(rows || []).map((machine) => (
          <a key={machine.id} href={`/machines/${machine.id}`} className="rounded-3xl border border-line bg-card p-4">
            <p className="font-semibold">{machine.name}</p>
            <p className="text-sm text-muted">{machine.status} · {machine.location || 'No location'} · service {inr(machine.maintenanceCost || 0)}</p>
          </a>
        ))}
      </div>
      <Dialog open={open} title="New machine" onClose={() => setOpen(false)} wide>
        <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
          <Field label="Name"><TextInput value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></Field>
          <Field label="Type"><TextInput value={form.machineType} onChange={(event) => setForm({ ...form, machineType: event.target.value })} /></Field>
          <Field label="Machine ID"><TextInput value={form.machineCode} onChange={(event) => setForm({ ...form, machineCode: event.target.value })} /></Field>
          <Field label="Brand"><TextInput value={form.brand} onChange={(event) => setForm({ ...form, brand: event.target.value })} /></Field>
          <Field label="Model"><TextInput value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} /></Field>
          <Field label="Serial number"><TextInput value={form.serialNumber} onChange={(event) => setForm({ ...form, serialNumber: event.target.value })} /></Field>
          <Field label="Purchase date"><TextInput type="date" value={form.purchaseDateKey} onChange={(event) => setForm({ ...form, purchaseDateKey: event.target.value })} /></Field>
          <Field label="Purchase price"><TextInput value={String(form.purchasePrice)} onChange={(event) => setForm({ ...form, purchasePrice: Number(event.target.value) })} /></Field>
          <Field label="Supplier"><TextInput value={form.supplierName} onChange={(event) => setForm({ ...form, supplierName: event.target.value })} /></Field>
          <Field label="Location"><TextInput value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} /></Field>
          <Field label="Warranty start"><TextInput type="date" value={form.warrantyStart} onChange={(event) => setForm({ ...form, warrantyStart: event.target.value })} /></Field>
          <Field label="Warranty end"><TextInput type="date" value={form.warrantyEnd} onChange={(event) => setForm({ ...form, warrantyEnd: event.target.value })} /></Field>
          <Field label="Installed"><TextInput type="date" value={form.installationDate} onChange={(event) => setForm({ ...form, installationDate: event.target.value })} /></Field>
          <Field label="Status">
            <SelectInput value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
              <option value="active">Active</option>
              <option value="maintenance">Under maintenance</option>
              <option value="inactive">Inactive</option>
              <option value="sold">Sold</option>
            </SelectInput>
          </Field>
          <div className="sm:col-span-2"><Field label="Notes"><TextArea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></Field></div>
          <Button type="submit">Save machine</Button>
        </form>
      </Dialog>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <article className="rounded-3xl border border-line bg-card p-4"><p className="text-xs uppercase text-muted">{label}</p><p className="mt-1">{value}</p></article>;
}
