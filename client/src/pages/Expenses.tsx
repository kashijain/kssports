import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { DocumentFileLink } from '../components/DocumentFileLink';
import { Button, Dialog, Empty, Field, PageHeader, SelectInput, Spinner, TextInput } from '../components/ui';
import { api } from '../lib/api';
import { inr, prettyDate, todayIn } from '../lib/format';
import { fail } from '../lib/toast';

interface Doc { id: string; name: string }
interface Expense { id: string; name: string; category: string; amount: number; date: string; method: string; vendor: string; notes: string; documents?: Doc[] }
interface Category { id: string; name: string }

export function Expenses() {
  const [rows, setRows] = useState<Expense[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', category: '', amount: '', dateKey: todayIn(), method: 'cash', vendor: '', notes: '' });
  const [custom, setCustom] = useState('');
  const [file, setFile] = useState<File | null>(null);

  function load() {
    Promise.all([api<{ expenses: Expense[] }>('/api/expenses'), api<{ categories: Category[] }>('/api/expenses/categories')])
      .then(([expenses, cats]) => {
        setRows(expenses.expenses);
        setCategories(cats.categories);
        setForm((current) => ({ ...current, category: current.category || cats.categories[0]?.name || '' }));
      })
      .catch(fail);
  }
  useEffect(() => { load(); }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    try {
      const created = await api<{ expense: { id: string } }>('/api/expenses', { method: 'POST', body: JSON.stringify({ ...form, amount: Number(form.amount) }) });
      if (file) {
        const body = new FormData();
        body.append('file', file);
        body.append('module', 'expense');
        body.append('recordId', created.expense.id);
        await api('/api/documents', { method: 'POST', body });
      }
      setFile(null);
      toast.success('Expense recorded.');
      setOpen(false);
      load();
    } catch (error) { fail(error); }
  }

  async function addCategory(event: React.FormEvent) {
    event.preventDefault();
    try {
      await api('/api/expenses/categories', { method: 'POST', body: JSON.stringify({ name: custom }) });
      setCustom('');
      load();
    } catch (error) { fail(error); }
  }

  return (
    <div>
      <PageHeader title="Expenses" lede="Operating costs: rent, power, salaries, and the rest. These are separate from supplier purchases." action={<Button onClick={() => setOpen(true)}>Add expense</Button>} />
      {!rows ? <Spinner /> : null}
      {rows && rows.length === 0 ? <Empty title="No expenses yet" body="Record rent, electricity, or a repair that is not a stock purchase." action={<Button onClick={() => setOpen(true)}>Add expense</Button>} /> : null}
      {rows && rows.length > 0 ? (
        <div className="overflow-x-auto rounded-3xl border border-line bg-card">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs uppercase text-muted"><tr><th className="px-4 py-3">Date</th><th>Name</th><th>Category</th><th>Vendor</th><th>Amount</th><th>File</th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-line">
                  <td className="px-4 py-3">{prettyDate(row.date)}</td>
                  <td>{row.name}</td>
                  <td>{row.category}</td>
                  <td>{row.vendor || '—'}</td>
                  <td>{inr(row.amount)}</td>
                  <td>
                    {(row.documents || []).map((doc) => (
                      <DocumentFileLink key={doc.id} id={doc.id} name={doc.name} mode="view" className="mr-2 inline font-semibold">{doc.name}</DocumentFileLink>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <Dialog open={open} title="New expense" onClose={() => setOpen(false)}>
        <form onSubmit={save} className="grid gap-3">
          <Field label="Name"><TextInput value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></Field>
          <Field label="Category">
            <SelectInput value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
              {categories.map((item) => <option key={item.id}>{item.name}</option>)}
            </SelectInput>
          </Field>
          <Field label="Amount"><TextInput value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} required /></Field>
          <Field label="Date"><TextInput type="date" value={form.dateKey} onChange={(event) => setForm({ ...form, dateKey: event.target.value })} required /></Field>
          <Field label="Payment method">
            <SelectInput value={form.method} onChange={(event) => setForm({ ...form, method: event.target.value })}>
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="bank_transfer">Bank transfer</option>
              <option value="card">Card</option>
              <option value="other">Other</option>
            </SelectInput>
          </Field>
          <Field label="Vendor"><TextInput value={form.vendor} onChange={(event) => setForm({ ...form, vendor: event.target.value })} /></Field>
          <Field label="Notes"><TextInput value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></Field>
          <Field label="Attachment">
            <input type="file" accept="application/pdf,image/jpeg,image/png" onChange={(event) => setFile(event.target.files?.[0] || null)} />
          </Field>
          <Button type="submit">Save expense</Button>
        </form>
        <form onSubmit={addCategory} className="mt-4 flex gap-2">
          <TextInput placeholder="New category" value={custom} onChange={(event) => setCustom(event.target.value)} />
          <Button variant="secondary" type="submit">Add</Button>
        </form>
      </Dialog>
    </div>
  );
}
