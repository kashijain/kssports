import { config } from './config.js';

const SHOP_EMAILS = new Set(['jainkashish015@gmail.com', 'ronisharma70822@gmail.com']);

export function shopLoginAllowed(email: string): boolean {
  if (config.isTest) return true;
  return SHOP_EMAILS.has(email.trim().toLowerCase());
}
