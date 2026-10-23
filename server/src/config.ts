import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../../.env') });
dotenv.config();

const production = process.env.NODE_ENV === 'production';

export const config = {
  port: Number(process.env.PORT) || 47291,
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/lekha',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-change-me',
  exposeResetLink: production ? process.env.EXPOSE_RESET_LINK === 'true' : process.env.EXPOSE_RESET_LINK !== 'false',
  chromePath: process.env.CHROME_PATH || (production ? '' : '/usr/local/bin/google-chrome'),
  seedDemo: production ? false : process.env.SEED_DEMO === 'true',
  cookieSecure: production || process.env.COOKIE_SECURE === 'true',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://127.0.0.1:47291',
  isTest: process.env.NODE_ENV === 'test',
  production,
};

export function originAllowed(origin: string | undefined): boolean {
  if (!origin) return true;
  const normalized = origin.trim().replace(/\/$/, '');
  const configured = [process.env.CLIENT_ORIGINS, process.env.CLIENT_ORIGIN, config.clientOrigin]
    .flatMap((value) => (value || '').split(','))
    .map((value) => value.trim().replace(/\/$/, ''))
    .filter(Boolean);
  if (configured.includes(normalized)) return true;
  if (/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(normalized)) return true;
  if (normalized.endsWith('.cvm.dev') || normalized.endsWith('.cursor.com')) return true;
  try {
    const host = new URL(normalized).hostname;
    if (host === 'kssportsbilling.vercel.app') return true;
    if (/^kssportsbilling[-.].+\.vercel\.app$/i.test(host)) return true;
  } catch {
    return false;
  }
  return false;
}

export function cloudinarySettings() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim() || '';
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim() || '';
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim() || '';
  return {
    cloudName,
    apiKey,
    apiSecret,
    enabled: Boolean(cloudName && apiKey && apiSecret),
  };
}

export const rootDir = path.resolve(here, '../..');
export const uploadsDir = path.join(rootDir, 'uploads');
export const clientDist = path.resolve(here, '../../client/dist');
