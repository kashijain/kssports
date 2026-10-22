import { useEffect, useState } from 'react';
import { loadAuthenticatedHtml } from '../lib/api';
import { fail } from '../lib/toast';
import { Spinner } from './ui';

export function AuthenticatedHtmlFrame({ path, title, className }: { path: string; title: string; className?: string }) {
  const [html, setHtml] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    setHtml('');
    setError('');
    loadAuthenticatedHtml(path)
      .then((text) => {
        if (live) setHtml(text);
      })
      .catch((err) => {
        if (!live) return;
        setError('The invoice preview could not be loaded.');
        fail(err);
      });
    return () => {
      live = false;
    };
  }, [path]);

  if (error) return <p className="rounded-3xl border border-line bg-card p-6 text-sm">{error}</p>;
  if (!html) {
    return (
      <div className="grid min-h-[320px] place-items-center">
        <Spinner />
      </div>
    );
  }
  return <iframe title={title} className={className} srcDoc={html} />;
}
