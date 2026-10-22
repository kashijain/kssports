const TOKEN_KEY = 'lekha_token';

export function authToken(): string {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function saveAuthToken(token: string) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* private mode */
  }
}

export function clearAuthToken() {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode */
  }
}

export function authHeader(): Record<string, string> {
  const token = authToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Production builds prefix API paths with VITE_API_URL.
 * The dev server always keeps relative paths so the Vite proxy stays in use.
 */
export function apiUrl(path: string): string {
  if (!path.startsWith('/')) return path;
  const configured = (import.meta.env.VITE_API_URL || '').trim().replace(/\/$/, '');
  const base = import.meta.env.DEV ? '' : configured;
  return base ? `${base}${path}` : path;
}

export class ApiError extends Error {
  status: number;
  fields?: Record<string, string>;
  constructor(message: string, status: number, fields?: Record<string, string>) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

function signedOut(path: string, status: number) {
  if (status !== 401) return;
  clearAuthToken();
  if (!path.startsWith('/api/auth/') && !window.location.pathname.startsWith('/login') && !window.location.pathname.startsWith('/share')) {
    window.location.assign('/login');
  }
}

async function errorFrom(response: Response): Promise<ApiError> {
  const text = await response.text();
  let message = 'Something went wrong.';
  let fields: Record<string, string> | undefined;
  if (text) {
    try {
      const data = JSON.parse(text);
      message = data?.error?.message || message;
      fields = data?.error?.fields;
    } catch {
      if (response.status === 503) message = 'The PDF could not be created.';
    }
  }
  return new ApiError(message, response.status, fields);
}

export async function authorizedResponse(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const bearer = authToken();
  if (bearer && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${bearer}`);
  const response = await fetch(apiUrl(path), { ...init, headers, credentials: 'include' });
  signedOut(path, response.status);
  return response;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const bearer = authToken();
  if (bearer && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${bearer}`);
  const response = await fetch(apiUrl(path), { ...init, headers, credentials: 'include' });
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (response.ok && typeof data?.token === 'string' && data.token) saveAuthToken(data.token);
  signedOut(path, response.status);
  if (!response.ok) {
    throw new ApiError(data?.error?.message || 'Something went wrong.', response.status, data?.error?.fields);
  }
  return data as T;
}

export async function loadAuthenticatedHtml(path: string): Promise<string> {
  const response = await authorizedResponse(path);
  const text = await response.text();
  if (!response.ok) {
    let message = 'Something went wrong.';
    try {
      message = JSON.parse(text)?.error?.message || message;
    } catch {
      /* not json */
    }
    throw new ApiError(message, response.status);
  }
  return text;
}

export async function fetchPublicText(path: string): Promise<string> {
  const response = await fetch(apiUrl(path));
  const text = await response.text();
  if (!response.ok) {
    let message = 'This link is not available.';
    try {
      message = JSON.parse(text)?.error?.message || message;
    } catch {
      /* not json */
    }
    throw new ApiError(message, response.status);
  }
  return text;
}

export async function openAuthenticated(path: string): Promise<void> {
  const popup = window.open('', '_blank');
  if (!popup) throw new ApiError('Allow pop-ups for KS Sports to preview this file.', 0);
  popup.document.title = 'KS Sports';
  popup.document.body.textContent = 'Opening…';
  try {
    const response = await authorizedResponse(path);
    if (!response.ok) {
      popup.close();
      throw await errorFrom(response);
    }
    const type = response.headers.get('content-type') || '';
    if (type.includes('text/html')) {
      const html = await response.text();
      popup.document.open();
      popup.document.write(html);
      popup.document.close();
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    popup.location.replace(url);
    window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
  } catch (error) {
    if (!popup.closed) popup.close();
    throw error;
  }
}

export async function downloadFile(path: string, filename: string) {
  const response = await authorizedResponse(path);
  if (!response.ok) throw await errorFrom(response);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
