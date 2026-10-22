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

export class ApiError extends Error {
  status: number;
  fields?: Record<string, string>;
  constructor(message: string, status: number, fields?: Record<string, string>) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const bearer = authToken();
  if (bearer && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${bearer}`);
  const response = await fetch(path, { ...init, headers, credentials: 'include' });
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (response.ok && typeof data?.token === 'string' && data.token) saveAuthToken(data.token);
  if (response.status === 401) clearAuthToken();
  if (response.status === 401 && !path.startsWith('/api/auth/') && !window.location.pathname.startsWith('/login') && !window.location.pathname.startsWith('/share')) {
    window.location.assign('/login');
  }
  if (!response.ok) {
    throw new ApiError(data?.error?.message || 'Something went wrong.', response.status, data?.error?.fields);
  }
  return data as T;
}

export async function downloadFile(path: string, filename: string) {
  const response = await fetch(path, { credentials: 'include', headers: authHeader() });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new ApiError(data?.error?.message || 'Download failed.', response.status);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
