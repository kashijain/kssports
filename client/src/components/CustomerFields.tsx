import type { CustomerDraft } from '../lib/customer';
import { StateSelect } from './StateSelect';
import { Field, TextInput } from './ui';

export function CustomerFields({
  value,
  onChange,
  errors = {},
}: {
  value: CustomerDraft;
  onChange: (next: CustomerDraft) => void;
  errors?: Record<string, string>;
}) {
  function set<K extends keyof CustomerDraft>(key: K, next: CustomerDraft[K]) {
    onChange({ ...value, [key]: next });
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Customer name" error={errors.name}>
        <TextInput value={value.name} onChange={(event) => set('name', event.target.value)} required />
      </Field>
      <Field label="Mobile" error={errors.mobile}>
        <TextInput value={value.mobile} onChange={(event) => set('mobile', event.target.value)} inputMode="tel" placeholder="10-digit mobile" />
      </Field>
      <Field label="Email" error={errors.email}>
        <TextInput type="email" value={value.email} onChange={(event) => set('email', event.target.value)} />
      </Field>
      <Field label="GSTIN (optional)" error={errors.gstin}>
        <TextInput value={value.gstin} onChange={(event) => set('gstin', event.target.value.toUpperCase())} placeholder="For registered buyers" className="uppercase" />
      </Field>
      <Field label="State" error={errors.stateCode}>
        <StateSelect value={value.stateCode} onChange={(code) => set('stateCode', code)} required />
      </Field>
      <Field label="Pincode" error={errors['billingAddress.pincode']}>
        <TextInput value={value.pincode} onChange={(event) => set('pincode', event.target.value)} inputMode="numeric" maxLength={6} />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Billing address" error={errors['billingAddress.line1']}>
          <TextInput value={value.line1} onChange={(event) => set('line1', event.target.value)} placeholder="Street, area" />
        </Field>
      </div>
      <Field label="Address line 2">
        <TextInput value={value.line2} onChange={(event) => set('line2', event.target.value)} />
      </Field>
      <Field label="City">
        <TextInput value={value.city} onChange={(event) => set('city', event.target.value)} />
      </Field>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" checked={value.sameAsBilling} onChange={(event) => set('sameAsBilling', event.target.checked)} />
        Shipping address is the same as billing
      </label>
      {!value.sameAsBilling ? (
        <>
          <div className="sm:col-span-2">
            <Field label="Shipping address">
              <TextInput value={value.shipLine1} onChange={(event) => set('shipLine1', event.target.value)} />
            </Field>
          </div>
          <Field label="Shipping line 2">
            <TextInput value={value.shipLine2} onChange={(event) => set('shipLine2', event.target.value)} />
          </Field>
          <Field label="Shipping city">
            <TextInput value={value.shipCity} onChange={(event) => set('shipCity', event.target.value)} />
          </Field>
          <Field label="Shipping pincode">
            <TextInput value={value.shipPincode} onChange={(event) => set('shipPincode', event.target.value)} inputMode="numeric" maxLength={6} />
          </Field>
          <Field label="Shipping state">
            <StateSelect value={value.shipStateCode} onChange={(code) => set('shipStateCode', code)} />
          </Field>
        </>
      ) : null}
    </div>
  );
}
