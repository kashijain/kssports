import { downloadFile, openAuthenticated } from '../lib/api';
import { fail } from '../lib/toast';

export function DocumentFileLink({
  id,
  name,
  mode,
  className = 'inline',
  children,
}: {
  id: string;
  name?: string;
  mode: 'view' | 'download';
  className?: string;
  children: React.ReactNode;
}) {
  const path = `/api/documents/${id}/file${mode === 'download' ? '?download=1' : ''}`;
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        const task = mode === 'download' ? downloadFile(path, name || 'document') : openAuthenticated(path);
        void task.catch(fail);
      }}
    >
      {children}
    </button>
  );
}
