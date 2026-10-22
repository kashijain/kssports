import { useMeta } from '../auth';
import { SelectInput } from './ui';

export function StateSelect({
  value,
  onChange,
  id,
  required = false,
  disabled = false,
}: {
  value: string;
  onChange: (code: string) => void;
  id?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  const meta = useMeta();
  return (
    <SelectInput id={id} required={required} disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">Choose a state</option>
      {(meta?.states ?? []).map((state) => (
        <option key={state.code} value={state.code}>
          {state.name} ({state.code}){state.legacy ? ' — older code' : ''}
        </option>
      ))}
    </SelectInput>
  );
}
